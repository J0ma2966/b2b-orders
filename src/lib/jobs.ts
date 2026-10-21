import "server-only";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { notifySupplierStaff, notifyUsers } from "@/lib/notify";
import { addEvent, lockOrder, notifyShop, releaseAll, shopNote } from "@/lib/orders";
import { accountState } from "@/lib/accounts";
import { issueCommissionInvoices, remindCommissionInvoices } from "@/lib/commission-invoices";

// Фоновые задачи (Л2, Л3, Л7, А1). Каждая идемпотентна: повторный запуск ничего не дублирует
// благодаря отметкам в записях (staleRemindedAt, cartRemindedAt, dueRemindedFor…).

export type JobSettings = {
  placedRemindHours: number;
  placedAutoCancelHours: number;
  problemRemindHours: number;
  problemAutoCancelHours: number;
  cartReminderHours: number;
};

export const JOB_DEFAULTS: JobSettings = {
  placedRemindHours: 2,
  placedAutoCancelHours: 24,
  problemRemindHours: 2,
  problemAutoCancelHours: 24,
  cartReminderHours: 24,
};

export const JOB_SETTINGS_KEY = "jobs";

// 0 — правило выключено
export async function jobSettings(): Promise<JobSettings> {
  const s = await db.platformSetting.findUnique({ where: { key: JOB_SETTINGS_KEY } });
  const v = (s?.value ?? {}) as Partial<Record<keyof JobSettings, unknown>>;
  const out = { ...JOB_DEFAULTS };
  for (const k of Object.keys(JOB_DEFAULTS) as (keyof JobSettings)[]) {
    const n = Number(v[k]);
    if (v[k] !== undefined && Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return out;
}

const SYSTEM = { userId: null, onBehalfOfUserId: null };
const HOUR = 3_600_000;
const ago = (now: Date, hours: number) => new Date(now.getTime() - hours * HOUR);

// Л2: заказ без ответа поставщика — напоминание, затем автоотмена с освобождением резерва
async function stalePlaced(now: Date, s: JobSettings) {
  let reminded = 0;
  let cancelled = 0;
  if (s.placedRemindHours > 0) {
    const rows = await db.order.findMany({ where: { status: "PLACED", staleRemindedAt: null, placedAt: { lt: ago(now, s.placedRemindHours) } }, take: 200 });
    for (const o of rows) {
      const { count } = await db.order.updateMany({ where: { id: o.id, status: "PLACED", staleRemindedAt: null }, data: { staleRemindedAt: now } });
      if (count === 0) continue;
      const left = Math.max(1, Math.round(s.placedAutoCancelHours - s.placedRemindHours));
      const body = s.placedAutoCancelHours > 0 ? `Примите или отклоните заказ. Без ответа он отменится через ${left} ч.` : "Примите или отклоните заказ.";
      await notifySupplierStaff(o.supplierId, { type: "order.stale", title: `Заказ №${o.number} ждёт ответа`, body, link: `/supplier/orders/${o.id}`, entity: "Order", entityId: o.id });
      reminded++;
    }
  }
  if (s.placedAutoCancelHours > 0) {
    const rows = await db.order.findMany({ where: { status: "PLACED", placedAt: { lt: ago(now, s.placedAutoCancelHours) } }, select: { id: true }, take: 200 });
    for (const { id } of rows) if (await autoCancel(id, "PLACED", `Поставщик не ответил за ${s.placedAutoCancelHours} ч`)) cancelled++;
  }
  return { reminded, cancelled };
}

// Л2: проблема доставки без решения поставщика
async function staleProblems(now: Date, s: JobSettings) {
  let reminded = 0;
  let cancelled = 0;
  if (s.problemRemindHours > 0) {
    const rows = await db.order.findMany({ where: { status: "DELIVERY_PROBLEM", staleRemindedAt: null, problemAt: { lt: ago(now, s.problemRemindHours) } }, take: 200 });
    for (const o of rows) {
      const { count } = await db.order.updateMany({ where: { id: o.id, status: "DELIVERY_PROBLEM", staleRemindedAt: null }, data: { staleRemindedAt: now } });
      if (count === 0) continue;
      await notifySupplierStaff(o.supplierId, { type: "order.problem_stale", title: `Проблема доставки №${o.number} ждёт решения`, body: o.problemNote ?? undefined, link: `/supplier/orders/${o.id}`, entity: "Order", entityId: o.id });
      reminded++;
    }
  }
  if (s.problemAutoCancelHours > 0) {
    const rows = await db.order.findMany({ where: { status: "DELIVERY_PROBLEM", problemAt: { lt: ago(now, s.problemAutoCancelHours) } }, select: { id: true }, take: 200 });
    for (const { id } of rows) if (await autoCancel(id, "DELIVERY_PROBLEM", `Проблема доставки не решена за ${s.problemAutoCancelHours} ч`)) cancelled++;
  }
  return { reminded, cancelled };
}

async function autoCancel(orderId: string, expected: "PLACED" | "DELIVERY_PROBLEM", reason: string) {
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== expected) return false;
    await releaseAll(tx, order, SYSTEM, "Автоотмена");
    await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED_BY_SUPPLIER", cancelledAt: new Date(), cancelledBy: "PLATFORM", cancelReason: reason, qrToken: null } });
    await addEvent(tx, order.id, { type: "status.auto_cancel", from: order.status, to: "CANCELLED_BY_SUPPLIER", comment: reason, actorRole: "SYSTEM" }, SYSTEM);
    await notifyShop(order.shopId, shopNote(order, "отменён автоматически", `${reason}. Резерв снят, можно заказать снова.`), tx);
    await notifySupplierStaff(order.supplierId, { type: "order.auto_cancelled", title: `Заказ №${order.number} отменён автоматически`, body: reason, link: `/supplier/orders/${order.id}`, entity: "Order", entityId: order.id }, ["OWNER", "ADMIN"], tx);
    if (order.courierId) await notifyUsers([order.courierId], { type: "order.cancelled", title: `Заказ №${order.number} отменён`, body: reason, link: "/courier", entity: "Order", entityId: order.id }, tx);
    return true;
  });
}

// Л3: за день до срока — напоминание магазину; при просрочке — магазину и поставщику
async function debtDue(now: Date) {
  let reminded = 0;
  let overdue = 0;
  const accounts = await db.shopAccount.findMany({ where: { paymentTermDays: { not: null }, balance: { gt: 0 } }, include: { supplier: true, shop: true }, take: 2000 });
  for (const a of accounts) {
    const { aging } = await accountState(db, a.shopId, a.supplierId, now);
    if (!aging) continue;
    const due = aging.dueDate;
    const sameMark = (m: Date | null) => !!m && m.getTime() === due.getTime();
    if (aging.overdueAmount > 0) {
      if (sameMark(a.overdueNotifiedFor)) continue;
      await db.shopAccount.update({ where: { id: a.id }, data: { overdueNotifiedFor: due } });
      await notifyShop(a.shopId, { type: "debt.overdue", title: `Долг ${a.supplier.displayName} просрочен`, body: `Просрочено ${formatMoney(aging.overdueAmount)}. Пока долг не погашен, заказы нужно оплачивать полностью при получении.`, link: "/shop/debts", entity: "ShopAccount", entityId: a.id });
      await notifySupplierStaff(a.supplierId, { type: "debt.overdue", title: `Просрочен долг: ${a.shop.name}`, body: `Просрочено ${formatMoney(aging.overdueAmount)}`, link: `/supplier/shops/${a.shopId}`, entity: "ShopAccount", entityId: a.id });
      overdue++;
    } else if (due.getTime() - now.getTime() <= 24 * HOUR && !sameMark(a.dueRemindedFor)) {
      await db.shopAccount.update({ where: { id: a.id }, data: { dueRemindedFor: due } });
      await notifyShop(a.shopId, { type: "debt.due", title: `Завтра срок оплаты долга ${a.supplier.displayName}`, body: `Долг ${formatMoney(Number(a.balance))}`, link: "/shop/debts", entity: "ShopAccount", entityId: a.id });
      reminded++;
    }
  }
  return { reminded, overdue };
}

// Л7: напоминание о забытой корзине — один раз после последнего изменения
async function forgottenCarts(now: Date, s: JobSettings) {
  if (s.cartReminderHours <= 0) return 0;
  const rows = await db.order.findMany({
    where: { status: "DRAFT", updatedAt: { lt: ago(now, s.cartReminderHours) }, items: { some: {} }, cartRemindedAt: null },
    include: { supplier: true, _count: { select: { items: true } } },
    take: 500,
  });
  for (const o of rows) {
    // updatedAt не трогаем: по нему видно, когда корзину меняли
    await db.order.update({ where: { id: o.id }, data: { cartRemindedAt: now, updatedAt: o.updatedAt } });
    await notifyShop(o.shopId, { type: "cart.reminder", title: `В корзине ${o.supplier.displayName} остались товары`, body: `Позиций: ${o._count.items}. Оформите заказ, пока товар есть в наличии.`, link: `/shop/cart/${o.supplierId}`, entity: "Order", entityId: o.id });
  }
  return rows.length;
}

export async function runJobs(now = new Date()) {
  const s = await jobSettings();
  return {
    placed: await stalePlaced(now, s),
    problems: await staleProblems(now, s),
    debts: await debtDue(now),
    carts: await forgottenCarts(now, s),
    commissionInvoices: await issueCommissionInvoices(now),
    commissionReminders: await remindCommissionInvoices(now),
  };
}

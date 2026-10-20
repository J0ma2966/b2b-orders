import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { applyStock, currentActor } from "@/lib/stock";
import { notifySupplierStaff, notifyUsers } from "@/lib/notify";
import { formatMoney } from "@/lib/format";
import { addEvent, lockOrder, notifyShop, OrderError, releaseAll, shopNote } from "@/lib/orders";
import { normalizeQrInput, sameToken } from "@/lib/qr-token";
import { creditCheck, distributePayment } from "./finance-core";
import { orderTotal, validQty } from "./order-core";

type Tx = Prisma.TransactionClient;
type Actor = { userId: string | null; onBehalfOfUserId: string | null };

const num = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

// Счёт магазина у поставщика, блокировка строки на время операции.
export async function lockAccount(tx: Tx, shopId: string, supplierId: string) {
  await tx.shopAccount.upsert({ where: { shopId_supplierId: { shopId, supplierId } }, update: {}, create: { shopId, supplierId } });
  await tx.$queryRaw`SELECT id FROM "ShopAccount" WHERE "shopId" = ${shopId} AND "supplierId" = ${supplierId} FOR UPDATE`;
  return tx.shopAccount.findUniqueOrThrow({ where: { shopId_supplierId: { shopId, supplierId } } });
}

// Запись в журнал задолженности с пересчётом баланса (ТЗ п. 43).
export async function addDebtEntry(
  tx: Tx,
  account: { id: string },
  e: { type: "ORDER_CHARGE" | "ORDER_PAYMENT" | "DEBT_PAYMENT" | "CORRECTION"; amount: number; orderId?: string | null; paymentMethod?: PaymentMethod | null; comment?: string | null; occurredAt?: Date; correctsId?: string | null },
  actor: Actor,
) {
  if (e.amount === 0) return null;
  const updated = await tx.shopAccount.update({ where: { id: account.id }, data: { balance: { increment: e.amount } } });
  return tx.debtEntry.create({
    data: {
      accountId: account.id,
      orderId: e.orderId ?? null,
      type: e.type,
      amount: e.amount,
      balanceAfter: updated.balance,
      paymentMethod: e.paymentMethod ?? null,
      comment: e.comment ?? null,
      occurredAt: e.occurredAt ?? new Date(),
      correctsId: e.correctsId ?? null,
      userId: actor.userId,
      onBehalfOfUserId: actor.onBehalfOfUserId,
    },
  });
}

async function courierOrder(tx: Tx, orderId: string, courierId: string) {
  const order = await lockOrder(tx, orderId);
  if (order.courierId !== courierId) throw new OrderError("Заказ не найден");
  return order;
}

// ───────────── Доставщик (ТЗ п. 29–35) ─────────────

export async function startDelivery(courierId: string, orderId: string) {
  const actor = await currentActor();
  await db.$transaction(async (tx) => {
    const order = await courierOrder(tx, orderId, courierId);
    if (order.status !== "ASSIGNED") throw new OrderError("Заказ ещё не готов к выезду или уже в пути");
    await tx.order.update({ where: { id: order.id }, data: { status: "IN_TRANSIT", inTransitAt: new Date() } });
    await addEvent(tx, order.id, { type: "status", from: order.status, to: "IN_TRANSIT", actorRole: "COURIER" }, actor);
    await notifyShop(order.shopId, shopNote(order, "в пути", "Доставщик выехал к вам"), tx);
  });
}

export async function reportProblem(courierId: string, orderId: string, note: string) {
  const actor = await currentActor();
  await db.$transaction(async (tx) => {
    const order = await courierOrder(tx, orderId, courierId);
    if (order.status !== "IN_TRANSIT") throw new OrderError("Сообщить о проблеме можно, когда заказ в пути");
    await tx.order.update({ where: { id: order.id }, data: { status: "DELIVERY_PROBLEM", problemNote: note } });
    await addEvent(tx, order.id, { type: "delivery.problem", from: order.status, to: "DELIVERY_PROBLEM", comment: note, actorRole: "COURIER" }, actor);
    await notifySupplierStaff(order.supplierId, { type: "order.problem", title: `Проблема с доставкой №${order.number}`, body: note, link: `/supplier/orders/${order.id}`, entity: "Order", entityId: order.id }, ["OWNER", "ADMIN"], tx);
  });
}

// Магазина нет на месте или заказ невозможно передать: резерв освобождается (ТЗ п. 13, 26).
export async function markNotDelivered(courierId: string, orderId: string, reason: string) {
  const actor = await currentActor();
  await db.$transaction(async (tx) => {
    const order = await courierOrder(tx, orderId, courierId);
    if (order.status !== "IN_TRANSIT" && order.status !== "DELIVERY_PROBLEM") throw new OrderError("Действие недоступно");
    await releaseAll(tx, order, actor, "Заказ не доставлен");
    await tx.order.update({ where: { id: order.id }, data: { status: "NOT_DELIVERED", problemNote: reason, qrToken: null } });
    await addEvent(tx, order.id, { type: "delivery.not_delivered", from: order.status, to: "NOT_DELIVERED", comment: reason, actorRole: "COURIER" }, actor);
    // Новый магазин, которого не оказалось на месте, получает статус «Не прошёл проверку» (решение этапа 1)
    const shop = await tx.shop.findUniqueOrThrow({ where: { id: order.shopId } });
    if (shop.status === "NEW") {
      await tx.shop.update({ where: { id: shop.id }, data: { status: "FAILED_CHECK" } });
      await tx.shopStatusHistory.create({ data: { shopId: shop.id, fromStatus: "NEW", toStatus: "FAILED_CHECK", reason: `Заказ №${order.number} не доставлен: ${reason}`, userId: actor.userId } });
    }
    await notifySupplierStaff(order.supplierId, { type: "order.not_delivered", title: `Заказ №${order.number} не доставлен`, body: reason, link: `/supplier/orders/${order.id}`, entity: "Order", entityId: order.id }, ["OWNER", "ADMIN"], tx);
    await notifyShop(order.shopId, shopNote(order, "не доставлен", reason), tx);
  });
}

export type AcceptanceInput = {
  items: { id: string; delivered: number; accepted: number }[];
  received: number;
  method: PaymentMethod;
  qr: string;
};

// Фактическая приёмка + полученная сумма + QR (ТЗ п. 31–35, 38–42).
export async function confirmDelivery(courierId: string, orderId: string, input: AcceptanceInput) {
  const actor = await currentActor();
  if (!Number.isFinite(input.received) || input.received < 0) throw new OrderError("Неверная полученная сумма");
  return db.$transaction(async (tx) => {
    const order = await courierOrder(tx, orderId, courierId);
    // Код проверяется до всего остального: чужой, отменённый, использованный — отказ
    if (order.status !== "IN_TRANSIT") {
      throw new OrderError(order.status === "NEEDS_CONFIRMATION" ? "Магазин запросил отмену, дождитесь решения поставщика" : "Заказ нельзя подтвердить в текущем статусе");
    }
    if (order.qrUsedAt || !order.qrToken) throw new OrderError("QR-код уже использован");
    if (!sameToken(normalizeQrInput(input.qr), order.qrToken)) throw new OrderError("QR-код не подходит к этому заказу");

    const units = new Map((await tx.productUnit.findMany({ where: { id: { in: order.items.map((i) => i.productUnitId) } } })).map((u) => [u.id, u]));
    const byId = new Map(input.items.map((i) => [i.id, i]));
    const accepted: { kind: (typeof order.items)[number]["kind"]; price: number; qty: number }[] = [];
    let anyPartial = false;
    let anyAccepted = false;
    for (const item of order.items) {
      const a = byId.get(item.id);
      if (!a) throw new OrderError(`Не указано количество для «${item.productName}»`);
      const qty = num(item.qty);
      const kind = units.get(item.productUnitId)!.kind;
      const okNum = (n: number) => n === 0 || validQty(kind, n);
      if (!okNum(a.delivered) || !okNum(a.accepted) || a.delivered > qty || a.accepted > a.delivered) {
        throw new OrderError(`«${item.productName}»: принято не может быть больше доставленного, доставлено — больше заказанного`);
      }
      if (a.accepted < qty) anyPartial = true;
      if (a.accepted > 0) anyAccepted = true;
      const type = item.kind === "BONUS" ? "BONUS" : item.kind === "FORCED" ? "FORCED_SALE" : "SALE";
      const rel = { relatedEntity: "Order", relatedId: order.id };
      if (a.accepted > 0) await applyStock(tx, { unitId: item.productUnitId, type, qty: a.accepted, reason: `Заказ №${order.number} принят`, ...rel }, actor);
      if (qty - a.accepted > 0) await applyStock(tx, { unitId: item.productUnitId, type: "RETURN_UNACCEPTED", qty: qty - a.accepted, reason: `Заказ №${order.number}: не принято`, ...rel }, actor);
      await tx.orderItem.update({ where: { id: item.id }, data: { deliveredQty: a.delivered, acceptedQty: a.accepted } });
      accepted.push({ kind: item.kind, price: num(item.price), qty: a.accepted });
    }
    // Стоимость — по фактически принятому (ТЗ п. 33, 68)
    const total = orderTotal(accepted);
    const account = await lockAccount(tx, order.shopId, order.supplierId);
    const before = num(account.balance);
    const dist = distributePayment(total, input.received, before);
    const creditError = creditCheck({ creditAllowed: account.creditAllowed, creditLimit: account.creditLimit === null ? null : num(account.creditLimit) }, before, dist.balanceAfter);
    if (creditError) throw new OrderError(creditError);

    const label = `Заказ №${order.number}`;
    await addDebtEntry(tx, account, { type: "ORDER_CHARGE", amount: total, orderId: order.id, comment: `${label}: принятые товары` }, actor);
    if (dist.toOrder > 0) await addDebtEntry(tx, account, { type: "ORDER_PAYMENT", amount: -dist.toOrder, orderId: order.id, paymentMethod: input.method, comment: `${label}: оплата при получении` }, actor);
    if (dist.toDebt > 0) await addDebtEntry(tx, account, { type: "DEBT_PAYMENT", amount: -dist.toDebt, orderId: order.id, paymentMethod: input.method, comment: `${label}: погашение прежнего долга` }, actor);
    if (dist.overpaid > 0) await addDebtEntry(tx, account, { type: "DEBT_PAYMENT", amount: -dist.overpaid, orderId: order.id, paymentMethod: input.method, comment: `${label}: переплата` }, actor);

    const now = new Date();
    const status = !anyAccepted ? "NOT_DELIVERED" : anyPartial ? "PARTIALLY_ACCEPTED" : "COMPLETED";
    await tx.order.update({
      where: { id: order.id },
      data: {
        status,
        qrUsedAt: now,
        deliveredAt: now,
        completedAt: now,
        orderedTotal: order.total,
        total,
        receivedAmount: input.received,
        receivedMethod: input.method,
        paidToOrder: dist.toOrder + dist.fromPrepay,
        paidToDebt: dist.toDebt,
        overpaid: dist.overpaid,
        orderDebt: dist.orderDebt,
        balanceBefore: before,
        balanceAfter: dist.balanceAfter,
        problemNote: anyAccepted ? order.problemNote : "Магазин отказался от всего товара",
      },
    });
    await addEvent(tx, order.id, {
      type: "delivery.confirmed",
      from: order.status,
      to: status,
      actorRole: "COURIER",
      data: { received: formatMoney(input.received), total, ...dist },
    }, actor);
    if (anyAccepted) {
      const shop = await tx.shop.findUniqueOrThrow({ where: { id: order.shopId } });
      if (shop.status === "NEW") {
        await tx.shop.update({ where: { id: shop.id }, data: { status: "VERIFIED" } });
        await tx.shopStatusHistory.create({ data: { shopId: shop.id, fromStatus: "NEW", toStatus: "VERIFIED", reason: `Первая доставка, заказ №${order.number}`, userId: actor.userId } });
      }
    }
    const body =
      dist.orderDebt > 0
        ? `Сумма ${formatMoney(total)}, получено ${formatMoney(input.received)}, долг по заказу ${formatMoney(dist.orderDebt)}`
        : `Сумма ${formatMoney(total)}, получено ${formatMoney(input.received)}`;
    await notifyShop(order.shopId, shopNote(order, "получение подтверждено", body), tx);
    await notifySupplierStaff(order.supplierId, { type: "order.delivered", title: `Доставка №${order.number} подтверждена`, body, link: `/supplier/orders/${order.id}`, entity: "Order", entityId: order.id }, ["OWNER", "ADMIN"], tx);
    return { status, total, ...dist };
  });
}

// ───────────── Отмена во время доставки (ТЗ п. 28) ─────────────

export async function requestCancel(shopId: string, orderId: string, reason: string) {
  const actor = await currentActor();
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.shopId !== shopId) throw new OrderError("Заказ не найден");
    if (order.status !== "IN_TRANSIT" && order.status !== "DELIVERY_PROBLEM") throw new OrderError("Запрос отмены доступен, когда заказ в пути");
    await tx.order.update({ where: { id: order.id }, data: { status: "NEEDS_CONFIRMATION", statusBeforeRequest: order.status, cancelRequestedAt: new Date(), cancelRequestReason: reason } });
    await addEvent(tx, order.id, { type: "cancel.requested", from: order.status, to: "NEEDS_CONFIRMATION", comment: reason, actorRole: "SHOP" }, actor);
    const n = { type: "order.cancel_request", title: `Магазин просит отменить заказ №${order.number}`, body: reason, entity: "Order", entityId: order.id };
    await notifySupplierStaff(order.supplierId, { ...n, link: `/supplier/orders/${order.id}` }, ["OWNER", "ADMIN"], tx);
    if (order.courierId) await notifyUsers([order.courierId], { ...n, link: "/courier" }, tx);
  });
}

export async function decideCancelRequest(supplierId: string, orderId: string, approve: boolean, comment: string | null, actorRole: string) {
  const actor = await currentActor();
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.supplierId !== supplierId) throw new OrderError("Заказ не найден");
    if (order.status !== "NEEDS_CONFIRMATION") throw new OrderError("Запроса на отмену нет");
    if (approve) {
      await releaseAll(tx, order, actor, "Отмена во время доставки согласована");
      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED_BY_SHOP", cancelledAt: new Date(), cancelledBy: "SHOP", cancelReason: order.cancelRequestReason, qrToken: null } });
      await addEvent(tx, order.id, { type: "cancel.approved", from: order.status, to: "CANCELLED_BY_SHOP", comment, actorRole }, actor);
    } else {
      const back = order.statusBeforeRequest ?? "IN_TRANSIT";
      await tx.order.update({ where: { id: order.id }, data: { status: back } });
      await addEvent(tx, order.id, { type: "cancel.declined", from: order.status, to: back, comment, actorRole }, actor);
    }
    await notifyShop(order.shopId, shopNote(order, approve ? "отмена согласована" : "в отмене отказано", comment ?? undefined), tx);
    if (order.courierId) {
      await notifyUsers([order.courierId], { type: "order.changed", title: approve ? `Заказ №${order.number} отменён, верните товар` : `Заказ №${order.number}: отмена не согласована, доставляйте`, link: "/courier", entity: "Order", entityId: order.id }, tx);
    }
  });
}

// Поставщик решает проблему доставки: продолжить, вернуть на склад для переназначения или отменить.
export async function resolveProblem(supplierId: string, orderId: string, resolution: "continue" | "back_to_ready" | "cancel", comment: string | null, actorRole: string) {
  const actor = await currentActor();
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.supplierId !== supplierId) throw new OrderError("Заказ не найден");
    if (order.status !== "DELIVERY_PROBLEM") throw new OrderError("Проблемы с доставкой нет");
    const labels = { continue: "доставка продолжается", back_to_ready: "заказ возвращён на склад", cancel: "заказ отменён" };
    if (resolution === "cancel") {
      if (!comment) throw new OrderError("Укажите причину отмены");
      await releaseAll(tx, order, actor, "Отмена из-за проблемы доставки");
      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED_BY_SUPPLIER", cancelledAt: new Date(), cancelledBy: "SUPPLIER", cancelReason: comment, qrToken: null } });
    } else if (resolution === "back_to_ready") {
      await tx.order.update({ where: { id: order.id }, data: { status: "READY", courierId: null, assignedAt: null, inTransitAt: null } });
    } else {
      await tx.order.update({ where: { id: order.id }, data: { status: "IN_TRANSIT" } });
    }
    const to = resolution === "cancel" ? "CANCELLED_BY_SUPPLIER" : resolution === "back_to_ready" ? "READY" : "IN_TRANSIT";
    await addEvent(tx, order.id, { type: "problem.resolved", from: order.status, to, comment, actorRole, data: { resolution: labels[resolution] } }, actor);
    await notifyShop(order.shopId, shopNote(order, labels[resolution], comment ?? undefined), tx);
    if (order.courierId) await notifyUsers([order.courierId], { type: "order.changed", title: `Заказ №${order.number}: ${labels[resolution]}`, link: "/courier", entity: "Order", entityId: order.id }, tx);
  });
}

// ───────────── Погашение и корректировки (ТЗ п. 44, 65) ─────────────

// Магазин работает с поставщиком: есть оформленный заказ или счёт. Финансовые операции
// по чужим магазинам запрещены, даже если их id подставлен в форму.
export async function supplierServesShop(client: Tx | typeof db, supplierId: string, shopId: string) {
  if (!shopId) return false;
  const [order, account] = await Promise.all([
    client.order.findFirst({ where: { supplierId, shopId, status: { not: "DRAFT" } }, select: { id: true } }),
    client.shopAccount.findUnique({ where: { shopId_supplierId: { shopId, supplierId } }, select: { id: true } }),
  ]);
  return !!order || !!account;
}

export async function registerDebtPayment(supplierId: string, shopId: string, amount: number, method: PaymentMethod, occurredAt: Date, comment: string | null) {
  if (!Number.isFinite(amount) || amount <= 0) throw new OrderError("Сумма должна быть больше нуля");
  const actor = await currentActor();
  return db.$transaction(async (tx) => {
    if (!(await supplierServesShop(tx, supplierId, shopId))) throw new OrderError("Магазин не найден");
    const account = await lockAccount(tx, shopId, supplierId);
    const entry = await addDebtEntry(tx, account, { type: "DEBT_PAYMENT", amount: -amount, paymentMethod: method, occurredAt, comment }, actor);
    await notifyShop(shopId, { type: "debt.payment", title: `Зарегистрировано погашение ${formatMoney(amount)}`, body: `Остаток: ${formatMoney(entry!.balanceAfter)}`, link: "/shop/debts", entity: "ShopAccount", entityId: account.id }, tx);
    return entry!;
  });
}

// Корректирующая операция: исходные записи не меняются, добавляется новая со знаком.
export async function correctBalance(supplierId: string, shopId: string, amount: number, reason: string, orderId: string | null, actorRole: string) {
  if (!Number.isFinite(amount) || amount === 0) throw new OrderError("Сумма корректировки не может быть нулевой");
  if (!reason) throw new OrderError("Укажите основание корректировки");
  const actor = await currentActor();
  return db.$transaction(async (tx) => {
    if (orderId) {
      const order = await lockOrder(tx, orderId);
      if (order.supplierId !== supplierId || order.shopId !== shopId) throw new OrderError("Заказ не найден");
      if (!["COMPLETED", "PARTIALLY_ACCEPTED"].includes(order.status)) throw new OrderError("Корректировать можно только полученный заказ");
      await tx.order.update({ where: { id: order.id }, data: { correctionTotal: { increment: amount } } });
      await addEvent(tx, order.id, { type: "correction", comment: reason, actorRole, data: { amount: formatMoney(amount) } }, actor);
    } else if (!(await supplierServesShop(tx, supplierId, shopId))) {
      throw new OrderError("Магазин не найден");
    }
    const account = await lockAccount(tx, shopId, supplierId);
    const entry = await addDebtEntry(tx, account, { type: "CORRECTION", amount, orderId, comment: reason }, actor);
    await notifyShop(shopId, { type: "debt.correction", title: `Корректировка задолженности ${amount > 0 ? "+" : ""}${formatMoney(amount)}`, body: reason, link: "/shop/debts", entity: "ShopAccount", entityId: account.id }, tx);
    return entry!;
  });
}

export async function setCredit(supplierId: string, shopId: string, creditAllowed: boolean, creditLimit: number | null) {
  return db.$transaction(async (tx) => {
    if (!(await supplierServesShop(tx, supplierId, shopId))) throw new OrderError("Магазин не найден");
    const account = await lockAccount(tx, shopId, supplierId);
    await tx.shopAccount.update({ where: { id: account.id }, data: { creditAllowed, creditLimit } });
    return { before: { creditAllowed: account.creditAllowed, creditLimit: account.creditLimit?.toString() ?? null } };
  });
}

export async function debtEntries(accountId: string, take = 200) {
  const entries = await db.debtEntry.findMany({ where: { accountId }, include: { order: { select: { id: true, number: true } } }, orderBy: { createdAt: "desc" }, take });
  const ids = [...new Set(entries.flatMap((e) => [e.userId, e.onBehalfOfUserId]).filter((x): x is string => !!x))];
  const users = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((u) => [u.id, u]));
  return entries.map((e) => ({ ...e, user: users.get(e.onBehalfOfUserId ?? e.userId ?? "") ?? null }));
}

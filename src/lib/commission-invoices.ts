import "server-only";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { notifySupplierStaff } from "@/lib/notify";
import { tashkentDay } from "./order-core";

// А1: счёт на комиссию за месяц. Сумма — по ставке, записанной в каждом полученном заказе.
const OFFSET = 5 * 3_600_000;
const PAY_DAYS = 10; // оплатить до 10-го числа следующего месяца

// Прошлый месяц по Ташкенту: дата счёта (1-е число) и границы [from, to)
export function previousMonth(now: Date) {
  const today = tashkentDay(now);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const period = new Date(Date.UTC(y, m - 1, 1));
  return {
    period,
    from: new Date(period.getTime() - OFFSET),
    to: new Date(Date.UTC(y, m, 1) - OFFSET),
    dueDate: new Date(Date.UTC(y, m, PAY_DAYS)),
  };
}

export async function issueCommissionInvoices(now = new Date()) {
  const { period, from, to, dueDate } = previousMonth(now);
  const orders = await db.order.findMany({
    where: { status: { in: ["COMPLETED", "PARTIALLY_ACCEPTED"] }, completedAt: { gte: from, lt: to } },
    select: { supplierId: true, total: true, correctionTotal: true, commissionRate: true },
  });
  const bySupplier = new Map<string, { orders: number; turnover: number; amount: number }>();
  for (const o of orders) {
    const value = Number(o.total) + Number(o.correctionTotal);
    const r = bySupplier.get(o.supplierId) ?? { orders: 0, turnover: 0, amount: 0 };
    r.orders++;
    r.turnover += value;
    r.amount += (value * Number(o.commissionRate ?? 0)) / 100;
    bySupplier.set(o.supplierId, r);
  }
  const existing = new Set((await db.commissionInvoice.findMany({ where: { period }, select: { supplierId: true } })).map((i) => i.supplierId));
  let issued = 0;
  for (const [supplierId, r] of bySupplier) {
    const amount = Math.round(r.amount * 100) / 100;
    if (existing.has(supplierId) || amount <= 0) continue;
    const inv = await db.commissionInvoice.upsert({
      where: { supplierId_period: { supplierId, period } },
      update: {},
      create: { supplierId, period, orders: r.orders, turnover: Math.round(r.turnover * 100) / 100, amount, dueDate },
    });
    await notifySupplierStaff(supplierId, { type: "commission.invoice", title: `Счёт на комиссию №${inv.number}: ${formatMoney(amount)}`, body: `Оплатить до ${dueDate.toISOString().slice(0, 10)}`, link: "/supplier/commission", entity: "CommissionInvoice", entityId: inv.id }, ["OWNER"]);
    issued++;
  }
  return issued;
}

export async function remindCommissionInvoices(now = new Date()) {
  const rows = await db.commissionInvoice.findMany({ where: { status: "ISSUED", remindedAt: null, dueDate: { lt: tashkentDay(now) } }, take: 500 });
  for (const inv of rows) {
    const { count } = await db.commissionInvoice.updateMany({ where: { id: inv.id, remindedAt: null }, data: { remindedAt: now } });
    if (count === 0) continue;
    await notifySupplierStaff(inv.supplierId, { type: "commission.overdue", title: `Просрочен счёт на комиссию №${inv.number}`, body: formatMoney(Number(inv.amount)), link: "/supplier/commission", entity: "CommissionInvoice", entityId: inv.id }, ["OWNER"]);
  }
  return rows.length;
}

// Долг поставщика перед платформой — неоплаченные счета
export async function supplierCommissionDebt(supplierId: string) {
  const r = await db.commissionInvoice.aggregate({ where: { supplierId, status: "ISSUED" }, _sum: { amount: true } });
  return Number(r._sum.amount ?? 0);
}

export const INVOICE_STATUS_LABEL = { ISSUED: "Выставлен", PAID: "Оплачен", CANCELLED: "Аннулирован" } as const;
export const INVOICE_STATUS_COLOR = { ISSUED: "yellow", PAID: "green", CANCELLED: "gray" } as const;

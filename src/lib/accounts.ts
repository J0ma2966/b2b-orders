import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { creditLeft, debtAging, requiredPayment, type CreditTerms } from "./finance-core";
import { DELIVERY_ACTIVE, PRE_DELIVERY } from "./order-core";

type Client = Prisma.TransactionClient | typeof db;

const num = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

// Заказы, которые уже оформлены, но ещё не получены: их сумма станет долгом при приёмке.
const OPEN = [...PRE_DELIVERY, ...DELIVERY_ACTIVE.filter((s) => !PRE_DELIVERY.includes(s))];

// Состояние счёта магазина у поставщика: баланс, кредит, срок оплаты и просрочка (Л1, Л3, М2).
export async function accountState(client: Client, shopId: string, supplierId: string, now = new Date()) {
  const account = await client.shopAccount.findUnique({ where: { shopId_supplierId: { shopId, supplierId } } });
  const balance = num(account?.balance);
  const termDays = account?.paymentTermDays ?? null;
  let aging: ReturnType<typeof debtAging> = null;
  if (account && balance > 0 && termDays !== null) {
    const charges = await client.debtEntry.findMany({
      where: { accountId: account.id, amount: { gt: 0 } },
      select: { amount: true, occurredAt: true },
      orderBy: { occurredAt: "desc" },
      take: 500,
    });
    aging = debtAging(balance, charges.map((c) => ({ amount: num(c.amount), at: c.occurredAt })), termDays, now);
  }
  const terms: CreditTerms = {
    creditAllowed: account?.creditAllowed ?? false,
    creditLimit: account?.creditLimit == null ? null : num(account.creditLimit),
    overdue: (aging?.overdueAmount ?? 0) > 0,
  };
  return { account, balance, terms, termDays, aging, creditLeft: creditLeft(terms, balance) };
}

// Сумма других открытых заказов магазина у поставщика (оформлены раньше этого).
export async function openOrdersTotal(client: Client, shopId: string, supplierId: string, opts: { excludeId?: string; placedBefore?: Date | null } = {}) {
  const r = await client.order.aggregate({
    where: {
      shopId,
      supplierId,
      status: { in: OPEN },
      ...(opts.excludeId && { id: { not: opts.excludeId } }),
      ...(opts.placedBefore && { placedAt: { lt: opts.placedBefore } }),
    },
    _sum: { total: true },
  });
  return num(r._sum.total);
}

// Сколько придётся оплатить при получении этого заказа: с учётом долга и заказов, которые приедут раньше.
export async function paymentDue(client: Client, o: { id?: string; shopId: string; supplierId: string; total: number; placedAt?: Date | null }) {
  const state = await accountState(client, o.shopId, o.supplierId);
  const ahead = await openOrdersTotal(client, o.shopId, o.supplierId, { excludeId: o.id, placedBefore: o.placedAt ?? undefined });
  const required = requiredPayment(state.terms, state.balance + ahead, o.total);
  // Заказ выходит за доступный кредит: магазин в долг работает, но этой суммы не хватает
  const overLimit = state.terms.creditAllowed && !state.terms.overdue ? required : 0;
  return { ...state, ahead, required, overLimit };
}

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { creditLeft, debtAging, debtTone, groupMultiOverdue, requiredPayment, type CreditTerms, type DebtTone } from "./finance-core";
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

// А3: просрочка магазинов у нескольких поставщиков, по срокам оплаты из Л3. Только для админа.
// shopId — проверить один магазин (его карточка у админа).
export async function multiOverdueShops(opts: { shopId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  // Просрочка возможна только при долге и заданном сроке оплаты; один такой счёт — ещё не «у нескольких»
  const candidates = await db.shopAccount.findMany({
    where: { balance: { gt: 0 }, paymentTermDays: { not: null }, ...(opts.shopId && { shopId: opts.shopId }) },
    select: { shopId: true, supplierId: true },
  });
  const perShop = new Map<string, number>();
  for (const c of candidates) perShop.set(c.shopId, (perShop.get(c.shopId) ?? 0) + 1);
  const states = await Promise.all(
    candidates
      .filter((c) => (perShop.get(c.shopId) ?? 0) >= 2)
      .map(async (c) => {
        const s = await accountState(db, c.shopId, c.supplierId, now);
        return { ...c, balance: s.balance, overdueAmount: s.aging?.overdueAmount ?? 0, overdueDays: s.aging?.overdueDays ?? 0, dueDate: s.aging?.dueDate ?? null };
      }),
  );
  const groups = groupMultiOverdue(states);
  if (!groups.length) return [];
  const [shops, suppliers] = await Promise.all([
    db.shop.findMany({ where: { id: { in: groups.map((g) => g.shopId) } }, select: { id: true, name: true, phone: true, status: true } }),
    db.supplier.findMany({ where: { id: { in: [...new Set(groups.flatMap((g) => g.accounts.map((a) => a.supplierId)))] } }, select: { id: true, displayName: true } }),
  ]);
  const shopById = new Map(shops.map((s) => [s.id, s]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  return groups.map((g) => ({
    ...g,
    shop: shopById.get(g.shopId)!,
    accounts: g.accounts.map((a) => ({ ...a, supplier: supplierById.get(a.supplierId)! })),
  }));
}

export type ShopDebtState = { shopId: string; balance: number; tone: DebtTone; overdueAmount: number; overdueDays: number; dueDate: Date | null };

// Счета всех магазинов поставщика с цветом долга (приложение поставщика: главная, список магазинов, заказы).
// Срок и просрочка считаются только у долгов с отсрочкой оплаты — как в accountState.
export async function supplierDebtStates(supplierId: string, opts: { shopIds?: string[]; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const accounts = await db.shopAccount.findMany({
    where: { supplierId, balance: { not: 0 }, ...(opts.shopIds && { shopId: { in: opts.shopIds } }) },
    select: { id: true, shopId: true, balance: true, paymentTermDays: true },
  });
  const states = await Promise.all(
    accounts.map(async (a): Promise<ShopDebtState> => {
      const balance = num(a.balance);
      let aging: ReturnType<typeof debtAging> = null;
      if (balance > 0 && a.paymentTermDays !== null) {
        const charges = await db.debtEntry.findMany({
          where: { accountId: a.id, amount: { gt: 0 } },
          select: { amount: true, occurredAt: true },
          orderBy: { occurredAt: "desc" },
          take: 500,
        });
        aging = debtAging(balance, charges.map((c) => ({ amount: num(c.amount), at: c.occurredAt })), a.paymentTermDays, now);
      }
      const overdueAmount = aging?.overdueAmount ?? 0;
      return { shopId: a.shopId, balance, tone: debtTone(balance, overdueAmount), overdueAmount, overdueDays: aging?.overdueDays ?? 0, dueDate: aging?.dueDate ?? null };
    }),
  );
  return new Map(states.map((s) => [s.shopId, s]));
}

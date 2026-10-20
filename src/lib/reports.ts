import "server-only";
import type { OrderStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { loadTerritoryMap } from "@/lib/territory";
import { groupSum } from "./report-core";

export type ReportFilter = {
  from: Date;
  to: Date;
  supplierId?: string;
  shopId?: string;
  territoryId?: string; // регион или город: включает все вложенные
  productId?: string;
  status?: OrderStatus;
};

const n = (v: { toString(): string } | null | undefined) => (v == null ? 0 : Number(v.toString()));
const RECEIVED: OrderStatus[] = ["COMPLETED", "PARTIALLY_ACCEPTED"];

async function territoryIds(rootId: string) {
  const byId = await loadTerritoryMap();
  const children = new Map<string, string[]>();
  for (const t of byId.values()) if (t.parentId) children.set(t.parentId, [...(children.get(t.parentId) ?? []), t.id]);
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

async function baseOrderWhere(f: ReportFilter): Promise<Prisma.OrderWhereInput> {
  return {
    ...(f.supplierId && { supplierId: f.supplierId }),
    ...(f.shopId && { shopId: f.shopId }),
    ...(f.territoryId && { shop: { territoryId: { in: await territoryIds(f.territoryId) } } }),
    ...(f.productId && { items: { some: { productUnit: { productId: f.productId } } } }),
  };
}

// Сводный отчёт: продажи, финансы, товары, логистика, замены (ТЗ п. 69–70).
export async function buildReport(f: ReportFilter) {
  const base = await baseOrderWhere(f);
  const inPeriod = { gte: f.from, lt: f.to };
  const soldWhere: Prisma.OrderWhereInput = { ...base, status: f.status ? f.status : { in: RECEIVED }, completedAt: inPeriod };

  const [sold, items, placed, cancelled, notDelivered, entries, accounts, replacements] = await Promise.all([
    db.order.findMany({ where: soldWhere, select: { id: true, total: true, correctionTotal: true, commissionRate: true, orderDebt: true, status: true, courierId: true, receivedAmount: true, supplierId: true, shopId: true, shop: { select: { name: true } }, supplier: { select: { displayName: true } } } }),
    db.orderItem.findMany({
      where: { order: soldWhere, ...(f.productId && { productUnit: { productId: f.productId } }) },
      select: { kind: true, price: true, acceptedQty: true, productName: true, unitLabel: true, productUnit: { select: { productId: true, product: { select: { category: { select: { name: true } } } } } }, order: { select: { shop: { select: { name: true } } } } },
    }),
    db.order.count({ where: { ...base, placedAt: inPeriod, status: { not: "DRAFT" } } }),
    db.order.count({ where: { ...base, cancelledAt: inPeriod, status: { in: ["CANCELLED_BY_SHOP", "CANCELLED_BY_SUPPLIER", "REJECTED"] } } }),
    db.order.findMany({ where: { ...base, status: "NOT_DELIVERED", updatedAt: inPeriod }, select: { courierId: true } }),
    db.debtEntry.findMany({
      where: { occurredAt: inPeriod, account: { ...(f.supplierId && { supplierId: f.supplierId }), ...(f.shopId && { shopId: f.shopId }) } },
      select: { type: true, amount: true },
    }),
    db.shopAccount.findMany({
      where: { ...(f.supplierId && { supplierId: f.supplierId }), ...(f.shopId && { shopId: f.shopId }), balance: { not: 0 } },
      select: { balance: true, supplierId: true, shop: { select: { name: true } }, supplier: { select: { displayName: true } } },
    }),
    db.replacement.findMany({
      where: { createdAt: inPeriod, ...(f.supplierId && { supplierId: f.supplierId }), ...(f.shopId && { shopId: f.shopId }) },
      select: { reason: true, productName: true, status: true, qty: true, shop: { select: { name: true } } },
    }),
  ]);

  const value = (o: (typeof sold)[number]) => n(o.total) + n(o.correctionTotal);
  const turnover = sold.reduce((s, o) => s + value(o), 0);
  const commission = sold.reduce((s, o) => s + (value(o) * n(o.commissionRate)) / 100, 0);
  const lines = items.map((i) => ({
    ...i,
    qty: n(i.acceptedQty),
    amount: i.kind === "BONUS" ? 0 : n(i.price) * n(i.acceptedQty),
    cost: n(i.price) * n(i.acceptedQty), // для бонусов — расход поставщика по цене в заказе
  })).filter((l) => l.qty > 0);
  const byKind = (k: string) => lines.filter((l) => l.kind === k);
  const productKey = (l: (typeof lines)[number]) => `${l.productName} · ${l.unitLabel}`;
  const byProduct = groupSum(lines.filter((l) => l.kind !== "BONUS"), productKey, (l) => l.amount, (l) => l.qty);

  // Показатели доставщиков
  const courierIds = [...new Set([...sold.map((o) => o.courierId), ...notDelivered.map((o) => o.courierId)].filter((x): x is string => !!x))];
  const couriers = new Map((await db.user.findMany({ where: { id: { in: courierIds } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  const courierStats = courierIds.map((id) => {
    const mine = sold.filter((o) => o.courierId === id);
    return {
      name: couriers.get(id) ?? "—",
      delivered: mine.length,
      partial: mine.filter((o) => o.status === "PARTIALLY_ACCEPTED").length,
      notDelivered: notDelivered.filter((o) => o.courierId === id).length,
      collected: mine.reduce((s, o) => s + n(o.receivedAmount), 0),
    };
  }).sort((a, b) => b.delivered - a.delivered);

  const sumType = (t: string) => -entries.filter((e) => e.type === t).reduce((s, e) => s + n(e.amount), 0);
  const currentDebt = accounts.reduce((s, a) => s + Math.max(0, n(a.balance)), 0);

  return {
    sales: {
      turnover,
      orders: sold.length,
      placed,
      soldUnits: groupSum(lines.filter((l) => l.kind !== "BONUS"), (l) => l.unitLabel, (l) => l.amount, (l) => l.qty),
      byProduct,
      byCategory: groupSum(lines.filter((l) => l.kind !== "BONUS"), (l) => l.productUnit.product.category?.name ?? "Без категории", (l) => l.amount, (l) => l.qty),
      byShop: groupSum(sold, (o) => o.shop.name, value),
      bySupplier: groupSum(sold, (o) => o.supplier.displayName, value),
    },
    finance: {
      ordersSum: turnover,
      paid: sumType("ORDER_PAYMENT") + sumType("DEBT_PAYMENT"),
      debtFormed: sold.reduce((s, o) => s + n(o.orderDebt), 0),
      repaid: sumType("DEBT_PAYMENT"),
      corrections: -sumType("CORRECTION"),
      currentDebt,
      commission: Math.round(commission * 100) / 100,
      debtors: accounts.filter((a) => n(a.balance) > 0).map((a) => ({ shop: a.shop.name, supplier: a.supplier.displayName, balance: n(a.balance) })).sort((a, b) => b.balance - a.balance),
      commissionBySupplier: groupSum(sold, (o) => o.supplier.displayName, (o) => (value(o) * n(o.commissionRate)) / 100),
    },
    products: {
      top: byProduct.slice(0, 10),
      least: [...byProduct].reverse().slice(0, 10),
      bonus: groupSum(byKind("BONUS"), productKey, (l) => l.cost, (l) => l.qty),
      forced: groupSum(byKind("FORCED"), productKey, (l) => l.amount, (l) => l.qty),
    },
    logistics: {
      deliveries: sold.length + notDelivered.length,
      completed: sold.filter((o) => o.status === "COMPLETED").length,
      partial: sold.filter((o) => o.status === "PARTIALLY_ACCEPTED").length,
      notDelivered: notDelivered.length,
      cancelled,
      couriers: courierStats,
    },
    replacements: {
      count: replacements.length,
      byReason: groupSum(replacements, (r) => r.reason, () => 0, (r) => n(r.qty)),
      byProduct: groupSum(replacements, (r) => r.productName, () => 0, (r) => n(r.qty)),
      byShop: groupSum(replacements, (r) => r.shop.name, () => 0, (r) => n(r.qty)),
      byStatus: groupSum(replacements, (r) => r.status, () => 0, (r) => n(r.qty)),
    },
  };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;

import "server-only";
import { db } from "@/lib/db";
import { availableSuppliersForShop } from "@/lib/territory";
import type { Prisma } from "@/generated/prisma/client";

// Поставщик, доступный магазину (территория, активен, не скрыт), или null (ТЗ п. 61).
export async function supplierForShop(shopTerritoryId: string, supplierId: string) {
  return (await availableSuppliersForShop(shopTerritoryId)).find((s) => s.id === supplierId) ?? null;
}

// Что видит магазин: товары в каталоге, доступные к заказу, только единицы с ценой.
export const shopVisibleProduct = (supplierId: string): Prisma.ProductWhereInput => ({
  supplierId,
  archivedAt: null,
  isAvailable: true,
  units: { some: { isActive: true, price: { not: null } } },
});

export const shopVisibleUnits = { where: { isActive: true, price: { not: null } }, orderBy: { sortOrder: "asc" as const } };

export type CatalogFilter = "" | "fav" | "often" | "promo";

// Действующие акции поставщика по единице-условию (М3)
export async function activePromotions(supplierId: string | string[], now = new Date()) {
  const rows = await db.bonusPromotion.findMany({ where: { supplierId: Array.isArray(supplierId) ? { in: supplierId } : supplierId, isActive: true, startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { createdAt: "asc" } });
  const byUnit = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!byUnit.has(r.triggerUnitId)) byUnit.set(r.triggerUnitId, r);
  return byUnit;
}

// М4: «часто заказываю» — товары из полученных заказов магазина, по числу заказов.
// Без supplierId — по всем поставщикам (лента на главной).
export async function oftenOrdered(shopId: string, supplierId: string | undefined, take = 30) {
  const rows = await db.orderItem.groupBy({
    by: ["productUnitId"],
    where: { kind: { not: "BONUS" }, order: { shopId, ...(supplierId && { supplierId }), status: { in: ["COMPLETED", "PARTIALLY_ACCEPTED"] } } },
    _count: { _all: true },
    orderBy: { _count: { productUnitId: "desc" } },
    take: take * 2,
  });
  const units = await db.productUnit.findMany({ where: { id: { in: rows.map((r) => r.productUnitId) } }, select: { id: true, productId: true } });
  const productOf = new Map(units.map((u) => [u.id, u.productId]));
  return [...new Set(rows.map((r) => productOf.get(r.productUnitId)).filter((x): x is string => !!x))].slice(0, take);
}

export async function shopCatalog(
  supplierId: string,
  opts: { q?: string; categoryId?: string; skip: number; take: number; shopId?: string; filter?: CatalogFilter },
) {
  const now = new Date();
  let only: Prisma.ProductWhereInput = {};
  if (opts.filter === "fav" && opts.shopId) only = { favorites: { some: { shopId: opts.shopId } } };
  if (opts.filter === "often" && opts.shopId) only = { id: { in: await oftenOrdered(opts.shopId, supplierId) } };
  if (opts.filter === "promo") {
    only = { units: { some: { isActive: true, price: { not: null }, bonusTriggers: { some: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } } } } } };
  }
  const where: Prisma.ProductWhereInput = {
    AND: [shopVisibleProduct(supplierId), only],
    ...(opts.categoryId && { categoryId: opts.categoryId }),
    ...(opts.q && {
      OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { brand: { contains: opts.q, mode: "insensitive" } }],
    }),
  };
  const [total, products, categories] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, include: { units: shopVisibleUnits }, orderBy: { name: "asc" }, skip: opts.skip, take: opts.take }),
    db.category.findMany({
      where: { supplierId, isArchived: false, products: { some: shopVisibleProduct(supplierId) } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  return { total, products, categories };
}

export type FeedSort = "new" | "name";

// Лента товаров на главной магазина: все доступные поставщики сразу.
// Категории у каждого поставщика свои, поэтому фильтр — по названию категории.
export async function shopFeed(
  supplierIds: string[],
  opts: { q?: string; category?: string; supplierId?: string; filter?: CatalogFilter; sort?: FeedSort; shopId: string; skip: number; take: number },
) {
  const ids = opts.supplierId ? supplierIds.filter((id) => id === opts.supplierId) : supplierIds;
  if (ids.length === 0) return { total: 0, products: [], categories: [] as string[] };
  const now = new Date();
  let only: Prisma.ProductWhereInput = {};
  if (opts.filter === "fav") only = { favorites: { some: { shopId: opts.shopId } } };
  if (opts.filter === "often") only = { id: { in: await oftenOrdered(opts.shopId, undefined, 60) } };
  if (opts.filter === "promo") {
    only = { units: { some: { isActive: true, price: { not: null }, bonusTriggers: { some: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } } } } } };
  }
  const visible: Prisma.ProductWhereInput = { OR: ids.map((id) => shopVisibleProduct(id)) };
  const where: Prisma.ProductWhereInput = {
    AND: [
      visible,
      only,
      ...(opts.category ? [{ category: { name: opts.category, isArchived: false } }] : []),
      ...(opts.q ? [{ OR: [{ name: { contains: opts.q, mode: "insensitive" as const } }, { brand: { contains: opts.q, mode: "insensitive" as const } }] }] : []),
    ],
  };
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = opts.sort === "name" ? [{ name: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "asc" }];
  const [total, products, categories] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, include: { units: shopVisibleUnits }, orderBy, skip: opts.skip, take: opts.take }),
    db.category.findMany({
      where: { supplierId: { in: ids }, isArchived: false, products: { some: visible } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { name: true },
    }),
  ]);
  return { total, products, categories: [...new Set(categories.map((c) => c.name))] };
}

export async function favoriteIds(shopId: string, productIds: string[]) {
  const rows = await db.favoriteProduct.findMany({ where: { shopId, productId: { in: productIds } }, select: { productId: true } });
  return new Set(rows.map((r) => r.productId));
}

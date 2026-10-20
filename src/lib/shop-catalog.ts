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

export async function shopCatalog(supplierId: string, opts: { q?: string; categoryId?: string; skip: number; take: number }) {
  const where: Prisma.ProductWhereInput = {
    ...shopVisibleProduct(supplierId),
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

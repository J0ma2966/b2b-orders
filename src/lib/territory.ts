import "server-only";
import { db } from "@/lib/db";
import { ancestorChain, type TerritoryNode } from "./territory-core";

export async function loadTerritoryMap() {
  const all = await db.territory.findMany({
    select: { id: true, parentId: true, name: true, type: true, isActive: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return new Map<string, TerritoryNode & { isActive: boolean }>(all.map((t) => [t.id, t]));
}

// Поставщики, доступные магазину по его территории (ТЗ п. 10, 89).
export async function availableSuppliersForShop(shopTerritoryId: string) {
  const byId = await loadTerritoryMap();
  const chainIds = ancestorChain(shopTerritoryId, byId).map((t) => t.id);
  return db.supplier.findMany({
    where: {
      status: "ACTIVE",
      hiddenFromShops: false,
      territories: { some: { territoryId: { in: chainIds } } },
    },
    orderBy: { displayName: "asc" },
  });
}

// Справочник для форм. Читается на каждый запрос: кэш, собранный при сборке,
// мог бы содержать данные другой базы.
export async function getTerritoryOptions() {
  const all = await db.territory.findMany({
    where: { isActive: true, type: { not: "COUNTRY" } },
    select: { id: true, name: true, type: true, parentId: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return all;
}

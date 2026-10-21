import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { loadTerritoryMap } from "@/lib/territory";
import { ancestorChain } from "./territory-core";
import { deliveryDateOptions } from "./order-core";

type Client = Prisma.TransactionClient | typeof db;

// Условия поставщика для конкретного магазина (П5, П8): берутся с самой точной территории
// поставщика, покрывающей магазин (район точнее города, город — региона).
export async function supplierTermsForShop(client: Client, supplierId: string, shopTerritoryId: string) {
  const [supplier, territories, byId] = await Promise.all([
    client.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { minOrderTotal: true, orderCutoffHour: true } }),
    client.supplierTerritory.findMany({ where: { supplierId } }),
    loadTerritoryMap(),
  ]);
  const own = new Map(territories.map((t) => [t.territoryId, t]));
  const match = ancestorChain(shopTerritoryId, byId).map((t) => own.get(t.id)).find(Boolean) ?? null;
  const weekdays = match?.deliveryWeekdays ?? [];
  const cutoffHour = supplier.orderCutoffHour;
  return {
    minOrderTotal: supplier.minOrderTotal === null ? null : Number(supplier.minOrderTotal),
    cutoffHour,
    weekdays,
    courierId: match?.courierId ?? null,
    // Дата выбирается из списка, только если поставщик задал час приёма или дни доставки
    restrictsDates: cutoffHour !== null || weekdays.length > 0,
    dates: (now = new Date()) => deliveryDateOptions(now, { cutoffHour, weekdays }),
  };
}

export type SupplierTerms = Awaited<ReturnType<typeof supplierTermsForShop>>;

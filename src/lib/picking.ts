import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CLOSED } from "./order-core";

// Заказы для сборки и отгрузки (П3, П4): отмеченные в списке или за день доставки / по доставщику.
export type PickingFilter = { ids?: string[]; date?: Date | null; courierId?: string | null };

const TO_PICK = ["ACCEPTED", "ASSEMBLING", "READY", "ASSIGNED"] as const;

export async function ordersForPicking(supplierId: string, f: PickingFilter) {
  const where: Prisma.OrderWhereInput = f.ids?.length
    ? { supplierId, id: { in: f.ids.slice(0, 200) }, status: { notIn: [...CLOSED, "DRAFT"] } }
    : {
        supplierId,
        status: { in: [...TO_PICK] },
        ...(f.date && { deliveryDate: f.date }),
        ...(f.courierId && { courierId: f.courierId }),
      };
  return db.order.findMany({
    where,
    include: { shop: true, courier: true, items: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ routeOrder: "asc" }, { number: "asc" }],
  });
}

type PickOrder = Awaited<ReturnType<typeof ordersForPicking>>[number];

// Сводный лист: товар → сколько всего → по каким магазинам
export function pickingSheet(orders: PickOrder[]) {
  const lines = new Map<string, { name: string; unit: string; total: number; byShop: { shop: string; number: number | null; qty: number; bonus: boolean }[] }>();
  for (const o of orders) {
    for (const i of o.items) {
      const key = `${i.productUnitId}`;
      const line = lines.get(key) ?? { name: i.productName, unit: i.unitLabel, total: 0, byShop: [] };
      const qty = Number(i.qty);
      line.total += qty;
      line.byShop.push({ shop: o.shop.name, number: o.number, qty, bonus: i.kind === "BONUS" });
      lines.set(key, line);
    }
  }
  return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function parsePickingParams(sp: Record<string, string | string[] | undefined>): PickingFilter {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const ids = one("ids").split(",").map((s) => s.trim()).filter(Boolean);
  const d = one("date");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00Z`) : null;
  return { ids, date, courierId: one("courier") || null };
}

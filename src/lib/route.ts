import "server-only";
import { db } from "@/lib/db";
import { DELIVERY_ACTIVE, planRoute, tashkentDay } from "@/lib/order-core";
import { OrderError } from "@/lib/orders";

// Д2: доставки доставщика на сегодня в порядке объезда и предстоящие
export async function courierRoute(supplierId: string, courierId: string) {
  const [orders, supplier] = await Promise.all([
    db.order.findMany({
      where: { supplierId, courierId, status: { in: DELIVERY_ACTIVE } },
      include: { shop: true, items: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ deliveryDate: "asc" }, { assignedAt: "asc" }],
    }),
    db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { officeLat: true, officeLng: true } }),
  ]);
  const today = tashkentDay(new Date());
  const start = supplier.officeLat != null && supplier.officeLng != null ? { lat: supplier.officeLat, lng: supplier.officeLng } : null;
  const todays = orders.filter((o) => !o.deliveryDate || o.deliveryDate <= today);
  // Заказы, которые уже везут (в пути, проблема) — первыми; остальные — от последней из них
  const busy = todays.filter((o) => o.status !== "ASSIGNED");
  const last = [...busy].reverse().find((o) => o.deliveryLat != null && o.deliveryLng != null);
  const route = [...busy, ...planRoute(todays.filter((o) => o.status === "ASSIGNED"), last ? { lat: last.deliveryLat!, lng: last.deliveryLng! } : start)];
  const later = orders.filter((o) => o.deliveryDate && o.deliveryDate > today);
  return { route, later };
}

// Поднять или опустить точку: текущий порядок фиксируется целиком как ручной
export async function moveInRoute(supplierId: string, courierId: string, orderId: string, dir: -1 | 1) {
  const { route } = await courierRoute(supplierId, courierId);
  const i = route.findIndex((o) => o.id === orderId);
  if (i < 0) throw new OrderError("Заказ не найден");
  const j = i + dir;
  if (j < 0 || j >= route.length || route[i].status !== "ASSIGNED" || route[j].status !== "ASSIGNED") return;
  [route[i], route[j]] = [route[j], route[i]];
  const planned = route.filter((o) => o.status === "ASSIGNED");
  await db.$transaction(planned.map((o, k) => db.order.update({ where: { id: o.id }, data: { routeOrder: k + 1 } })));
}

export async function resetRoute(supplierId: string, courierId: string) {
  await db.order.updateMany({ where: { supplierId, courierId, status: { in: DELIVERY_ACTIVE } }, data: { routeOrder: null } });
}

import { EmptyState, PageHeader } from "@/components/ui";
import { PointsMap, type MapPoint } from "@/components/map/points-map";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { DELIVERY_ACTIVE } from "@/lib/order-core";

export default async function CourierMapPage() {
  const ctx = await requireSupplier(["COURIER"]);
  const me = ctx.auth.user.id;
  const [orders, replacements] = await Promise.all([
    db.order.findMany({ where: { supplierId: ctx.supplier.id, courierId: me, status: { in: DELIVERY_ACTIVE } }, include: { shop: true } }),
    db.replacement.findMany({ where: { supplierId: ctx.supplier.id, courierId: me, status: "ASSIGNED" }, include: { shop: true } }),
  ]);
  const points: MapPoint[] = [
    ...orders.filter((o) => o.deliveryLat && o.deliveryLng).map((o) => ({ lat: o.deliveryLat!, lng: o.deliveryLng!, label: `№${o.number} · ${o.shop.name}`, note: o.deliveryAddress ?? "", href: `/courier/orders/${o.id}`, color: "#f59e0b" })),
    ...replacements.map((r) => ({ lat: r.shop.lat, lng: r.shop.lng, label: `Замена №${r.number} · ${r.shop.name}`, note: r.shop.address, href: "/courier/replacements", color: "#7c3aed" })),
  ];
  return (
    <>
      <PageHeader title="Карта доставок" />
      {points.length === 0 ? <EmptyState>Точек доставки нет</EmptyState> : <PointsMap points={points} legend={[{ color: "#f59e0b", label: "Доставки" }, { color: "#7c3aed", label: "Замены" }]} />}
    </>
  );
}

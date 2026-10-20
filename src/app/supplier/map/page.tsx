import { Card, PageHeader } from "@/components/ui";
import { PointsMap, type MapPoint } from "@/components/map/points-map";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { loadTerritoryMap } from "@/lib/territory";
import { territoryLabel } from "@/lib/territory-core";
import { formatMoney } from "@/lib/format";
import { DELIVERY_ACTIVE } from "@/lib/order-core";

export default async function SupplierMapPage() {
  const ctx = await requireActiveSupplier();
  const s = ctx.supplier;
  const [shops, deliveries, territories, byId] = await Promise.all([
    db.shop.findMany({
      where: { OR: [{ orders: { some: { supplierId: s.id, status: { not: "DRAFT" } } } }, { accounts: { some: { supplierId: s.id } } }] },
      include: { accounts: { where: { supplierId: s.id } } },
    }),
    db.order.findMany({ where: { supplierId: s.id, status: { in: DELIVERY_ACTIVE } }, include: { shop: true, courier: true } }),
    db.supplierTerritory.findMany({ where: { supplierId: s.id } }),
    loadTerritoryMap(),
  ]);
  const points: MapPoint[] = [];
  if (s.officeLat && s.officeLng) points.push({ lat: s.officeLat, lng: s.officeLng, label: "Главный офис", note: s.officeAddress, color: "#1f5ad6", size: 11 });
  for (const sh of shops) {
    const debt = Number(sh.accounts[0]?.balance ?? 0);
    points.push({ lat: sh.lat, lng: sh.lng, label: sh.name, note: debt > 0 ? `Долг ${formatMoney(debt)}` : sh.address, href: `/supplier/shops/${sh.id}`, color: debt > 0 ? "#dc2626" : "#16a34a" });
  }
  for (const o of deliveries) {
    if (o.deliveryLat && o.deliveryLng) points.push({ lat: o.deliveryLat, lng: o.deliveryLng, label: `Доставка №${o.number}`, note: `${o.shop.name}${o.courier ? `, ${o.courier.fullName}` : ""}`, href: `/supplier/orders/${o.id}`, color: "#f59e0b", size: 6 });
  }
  return (
    <>
      <PageHeader title="Карта" />
      <PointsMap points={points} legend={[{ color: "#1f5ad6", label: "Офис" }, { color: "#16a34a", label: "Магазины" }, { color: "#dc2626", label: "Магазины с долгом" }, { color: "#f59e0b", label: "Текущие доставки" }]} />
      <Card className="mt-4">
        <h2 className="mb-2 font-semibold">Территория доставки</h2>
        <p className="text-sm text-gray-700">{territories.map((t) => territoryLabel(t.territoryId, byId)).join("; ") || "не задана"}</p>
      </Card>
    </>
  );
}

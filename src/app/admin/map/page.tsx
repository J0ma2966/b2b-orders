import { PageHeader } from "@/components/ui";
import { PointsMap, type MapPoint } from "@/components/map/points-map";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { DELIVERY_ACTIVE } from "@/lib/order-core";
import { getT } from "@/lib/i18n/server";

export default async function AdminMapPage({ searchParams }: PageProps<"/admin/map">) {
  const t = await getT();
  await requireSuperAdmin();
  const sp = await searchParams;
  const supplierId = typeof sp.supplier === "string" ? sp.supplier : "";
  const [suppliers, shops, deliveries] = await Promise.all([
    db.supplier.findMany({ where: { status: "ACTIVE" }, select: { id: true, displayName: true, officeLat: true, officeLng: true, officeAddress: true } }),
    db.shop.findMany({ where: supplierId ? { orders: { some: { supplierId } } } : {}, select: { id: true, name: true, lat: true, lng: true, address: true, isBlocked: true } }),
    db.order.findMany({ where: { status: { in: DELIVERY_ACTIVE }, ...(supplierId && { supplierId }) }, select: { id: true, number: true, deliveryLat: true, deliveryLng: true, shop: { select: { name: true } } } }),
  ]);
  const points: MapPoint[] = [
    ...suppliers.filter((s) => s.officeLat && s.officeLng && (!supplierId || s.id === supplierId)).map((s) => ({ lat: s.officeLat!, lng: s.officeLng!, label: s.displayName, note: s.officeAddress, href: `/admin/suppliers/${s.id}`, color: "#1f5ad6", size: 11 })),
    ...shops.map((s) => ({ lat: s.lat, lng: s.lng, label: s.name, note: s.address, href: `/admin/shops/${s.id}`, color: s.isBlocked ? "#6b7280" : "#16a34a" })),
    ...deliveries.filter((o) => o.deliveryLat && o.deliveryLng).map((o) => ({ lat: o.deliveryLat!, lng: o.deliveryLng!, label: `Доставка №${o.number}`, note: o.shop.name, href: `/admin/orders/${o.id}`, color: "#f59e0b", size: 6 })),
  ];
  return (
    <>
      <PageHeader title="Карта" />
      <form className="mb-3 flex gap-2">
        <select name="supplier" defaultValue={supplierId} className="rounded-lg px-2 py-1.5 text-sm ring-1 ring-gray-300" aria-label={t("Поставщик")}>
          <option value="">{t("Все поставщики")}</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </select>
        <button className="rounded-lg bg-surface px-3 py-1.5 text-sm ring-1 ring-gray-300">{t("Показать")}</button>
      </form>
      <PointsMap points={points} legend={[{ color: "#1f5ad6", label: "Офисы поставщиков" }, { color: "#16a34a", label: "Магазины" }, { color: "#6b7280", label: "Заблокированные" }, { color: "#f59e0b", label: "Текущие доставки" }]} />
    </>
  );
}

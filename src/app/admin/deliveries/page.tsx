import { EmptyState, PageHeader } from "@/components/ui";
import { OrdersList } from "@/components/orders/order-view";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { DELIVERY_ACTIVE } from "@/lib/order-core";

export default async function AdminDeliveriesPage() {
  await requireSuperAdmin();
  const rows = await db.order.findMany({ where: { status: { in: [...DELIVERY_ACTIVE, "READY"] } }, include: { shop: true, supplier: true, courier: true }, orderBy: { placedAt: "asc" }, take: 300 });
  return (
    <>
      <PageHeader title="Доставки" subtitle="Готовые к доставке, назначенные и в пути" />
      {rows.length === 0 ? <EmptyState>Активных доставок нет</EmptyState> : <OrdersList rows={rows} href={(id) => `/admin/orders/${id}`} party={(o) => `${o.supplier.displayName} → ${o.shop.name}${o.courier ? ` · ${o.courier.fullName}` : " · без доставщика"}`} />}
    </>
  );
}

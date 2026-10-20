import { EmptyState, PageHeader } from "@/components/ui";
import { DeliveryCard } from "@/components/orders/delivery-card";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { DELIVERY_ACTIVE } from "@/lib/order-core";
import { getT } from "@/lib/i18n/server";

// Мои доставки: сегодня и предстоящие (ТЗ п. 74).
export default async function CourierHome() {
  const t = await getT();
  const ctx = await requireSupplier(["COURIER"]);
  const orders = await db.order.findMany({
    where: { supplierId: ctx.supplier.id, courierId: ctx.auth.user.id, status: { in: DELIVERY_ACTIVE } },
    include: { shop: true, items: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ deliveryDate: "asc" }, { assignedAt: "asc" }],
  });
  const replacementsByShop = await db.replacement.groupBy({
    by: ["shopId"],
    where: { supplierId: ctx.supplier.id, courierId: ctx.auth.user.id, status: "ASSIGNED" },
    _count: true,
  });
  const repl = new Map(replacementsByShop.map((r) => [r.shopId, r._count]));
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" }) + "T00:00:00Z");
  const now = orders.filter((o) => !o.deliveryDate || o.deliveryDate <= today);
  const later = orders.filter((o) => o.deliveryDate && o.deliveryDate > today);
  return (
    <>
      <PageHeader title="Мои доставки" subtitle={ctx.supplier.displayName} />
      {orders.length === 0 && <EmptyState>{t("Назначенных доставок пока нет")}</EmptyState>}
      {now.length > 0 && (
        <section className="mb-6 space-y-3">
          <h2 className="font-semibold">{t("Сегодня")} · {now.length}</h2>
          {now.map((o) => <DeliveryCard key={o.id} o={o} href={`/courier/orders/${o.id}`} replacements={repl.get(o.shopId)} />)}
        </section>
      )}
      {later.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">{t("Предстоящие")} · {later.length}</h2>
          {later.map((o) => <DeliveryCard key={o.id} o={o} href={`/courier/orders/${o.id}`} replacements={repl.get(o.shopId)} />)}
        </section>
      )}
    </>
  );
}

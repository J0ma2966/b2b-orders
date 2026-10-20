import { Card, EmptyState, PageHeader } from "@/components/ui";
import { Media } from "@/components/orders/replacement-view";
import { CompleteReplacementForm } from "@/components/orders/replacement-forms";
import { mapLinks } from "@/components/orders/delivery-card";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { formatQty } from "@/lib/catalog";
import { formatPhone } from "@/lib/phone";

export default async function CourierReplacementsPage() {
  const ctx = await requireSupplier(["COURIER"]);
  const me = ctx.auth.user.id;
  const rows = await db.replacement.findMany({
    where: {
      supplierId: ctx.supplier.id,
      OR: [{ courierId: me, status: "ASSIGNED" }, { status: { in: ["APPROVED", "ASSIGNED"] }, newOrder: { courierId: me } }],
    },
    include: { shop: true, order: true, newOrder: true },
    orderBy: { assignedAt: "asc" },
  });
  return (
    <>
      <PageHeader title="Замены" subtitle="Привезите новый товар и заберите старый" />
      {rows.length === 0 && <EmptyState>Заданий на замену нет</EmptyState>}
      <div className="space-y-3">
        {rows.map((r) => {
          const links = mapLinks(r.shop.lat, r.shop.lng);
          return (
            <Card key={r.id}>
              <div className="font-semibold">Замена №{r.number} · {r.shop.name}</div>
              <div className="text-sm text-gray-600">{r.shop.address}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
                <a className="text-brand-600" href={`tel:${r.shop.phone}`}>📞 {formatPhone(r.shop.phone)}</a>
                <a className="text-brand-600" href={links.yandex} target="_blank" rel="noreferrer">🗺️ Карта</a>
              </div>
              <p className="mt-2 text-sm"><b>{r.productName}</b> — {formatQty(r.qty)} {r.unitLabel}. Причина: {r.reason}. Исходный заказ №{r.order.number}{r.newOrder && `, везти вместе с заказом №${r.newOrder.number}`}.</p>
              <div className="mt-2"><Media photos={r.photoPaths} videos={[]} /></div>
              <div className="mt-3"><CompleteReplacementForm id={r.id} /></div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

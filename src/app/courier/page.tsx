import { Card, EmptyState, PageHeader } from "@/components/ui";
import { OrderStatusBadge } from "@/components/orders/order-view";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { formatQty } from "@/lib/catalog";
import { formatDate, formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { ITEM_KIND_LABEL } from "@/lib/order-core";

// Карточки доставок (ТЗ п. 29). Действия в пути и приёмка — на этапе доставки.
export default async function CourierHome() {
  const ctx = await requireSupplier(["COURIER"]);
  const orders = await db.order.findMany({
    where: { supplierId: ctx.supplier.id, courierId: ctx.auth.user.id, status: { in: ["ASSIGNED", "IN_TRANSIT"] } },
    include: { shop: true, items: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ deliveryDate: "asc" }, { assignedAt: "asc" }],
  });
  return (
    <>
      <PageHeader title="Мои доставки" subtitle={ctx.supplier.displayName} />
      {orders.length === 0 ? (
        <EmptyState>Назначенных доставок пока нет</EmptyState>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">№{o.number} · {o.shop.name}</div>
                  <div className="text-sm text-gray-600">{o.deliveryAddress}</div>
                </div>
                <OrderStatusBadge status={o.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <a className="text-brand-600" href={`tel:${o.contactPhone}`}>📞 {o.contactName}, {formatPhone(o.contactPhone ?? "")}</a>
                {o.deliveryLat && o.deliveryLng && (
                  <a className="text-brand-600" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${o.deliveryLat}&mlon=${o.deliveryLng}#map=17/${o.deliveryLat}/${o.deliveryLng}`}>🗺️ На карте</a>
                )}
                {o.deliveryDate && <span>📅 {formatDate(o.deliveryDate)}</span>}
              </div>
              <ul className="mt-3 divide-y divide-gray-100 text-sm">
                {o.items.map((i) => (
                  <li key={i.id} className="flex justify-between py-1.5">
                    <span>{i.productName}{i.kind !== "REGULAR" && <span className="text-xs text-gray-500"> · {ITEM_KIND_LABEL[i.kind]}</span>}</span>
                    <span className="shrink-0">{formatQty(i.qty)} {i.unitLabel}</span>
                  </li>
                ))}
              </ul>
              {o.comment && <p className="mt-2 text-sm text-gray-700">💬 {o.comment}</p>}
              <div className="mt-2 text-right font-semibold">К оплате: {formatMoney(o.total)}</div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

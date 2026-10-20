import { EmptyState, PageHeader } from "@/components/ui";
import { Media } from "@/components/orders/replacement-view";
import { CompleteReplacementForm } from "@/components/orders/replacement-forms";
import { ActionTiles } from "@/components/orders/delivery-card";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { formatQty } from "@/lib/catalog";
import { getT } from "@/lib/i18n/server";

export default async function CourierReplacementsPage() {
  const t = await getT();
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
      {rows.length === 0 && <EmptyState>{t("Заданий на замену нет")}</EmptyState>}
      <div className="space-y-3">
        {rows.map((r) => (
          <section key={r.id} className="rounded-2xl bg-surface p-4 ring-1 ring-gray-200">
            <span className="text-sm font-semibold text-gray-500">{t("Замена №{n}", { n: r.number })}</span>
            <h2 className="mt-1 text-xl leading-tight font-bold">{r.shop.name}</h2>
            <p className="mt-1 leading-snug text-gray-700">{r.shop.address}</p>
            <div className="mt-3">
              <ActionTiles phone={r.shop.phone} lat={r.shop.lat} lng={r.shop.lng} />
            </div>
            <div className="mt-3 rounded-xl bg-gray-100 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold">🔁 {r.productName}</span>
                <span className="shrink-0 text-lg font-bold tabular-nums">
                  {formatQty(r.qty)} <span className="text-sm font-medium text-gray-500">{t(r.unitLabel)}</span>
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {t("Причина: {reason}", { reason: t(r.reason) })}. {t("Исходный заказ №{n}", { n: r.order.number })}
                {r.newOrder && `, ${t("везти вместе с заказом №{n}", { n: r.newOrder.number })}`}.
              </p>
            </div>
            <div className="mt-3"><Media photos={r.photoPaths} videos={[]} /></div>
            <div className="mt-3"><CompleteReplacementForm id={r.id} /></div>
          </section>
        ))}
      </div>
    </>
  );
}

import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { Media } from "@/components/orders/replacement-view";
import { ReturnedStatusForm } from "@/components/orders/replacement-forms";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { formatQty } from "@/lib/catalog";
import { formatDateTime } from "@/lib/format";
import { RETURNED_FINAL, RETURNED_STATUS_COLOR, RETURNED_STATUS_LABEL } from "@/lib/replacement-core";
import type { ReturnedStatus } from "@/generated/prisma/enums";

// Возвращённые товары (ТЗ п. 48–49): в основной остаток — только отдельной операцией
export default async function ReturnedPage({ searchParams }: PageProps<"/supplier/returned">) {
  const ctx = await requireActiveSupplier();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && sp.status in RETURNED_STATUS_LABEL ? (sp.status as ReturnedStatus) : undefined;
  const rows = await db.returnedItem.findMany({
    where: { supplierId: ctx.supplier.id, ...(status && { status }) },
    include: { shop: true, order: true, replacement: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const couriers = new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => r.courierId).filter((x): x is string => !!x) } } })).map((u) => [u.id, u.fullName]));
  const options = Object.keys(RETURNED_STATUS_LABEL) as ReturnedStatus[];
  return (
    <>
      <PageHeader title="Возвращённые товары" subtitle="Забранный при замене товар не возвращается в остаток автоматически" />
      <FilterBar search={false} status={status} statuses={Object.entries(RETURNED_STATUS_LABEL)} />
      {rows.length === 0 ? (
        <EmptyState>Возвращённых товаров нет</EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{r.productName} — {formatQty(r.qty)} {r.unitLabel}</div>
                  <div className="text-xs text-gray-500">
                    {r.shop.name} · заказ <Link className="text-brand-600" href={`/supplier/orders/${r.orderId}`}>№{r.order.number}</Link>
                    {r.replacement && <> · <Link className="text-brand-600" href={`/supplier/replacements/${r.replacement.id}`}>замена №{r.replacement.number}</Link></>}
                    {" "}· {r.reason} · {formatDateTime(r.createdAt)}{r.courierId && ` · ${couriers.get(r.courierId)}`}
                  </div>
                  {r.comment && <div className="mt-1 text-sm">{r.comment}</div>}
                </div>
                <Badge color={RETURNED_STATUS_COLOR[r.status]}>{RETURNED_STATUS_LABEL[r.status]}</Badge>
              </div>
              <div className="mt-2"><Media photos={r.photoPaths} videos={r.videoPaths} /></div>
              {!RETURNED_FINAL.includes(r.status) && <ReturnedStatusForm id={r.id} current={r.status} options={options} />}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

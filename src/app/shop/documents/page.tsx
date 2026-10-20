import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";

// Документы магазина: чеки и накладные по полученным заказам (ТЗ п. 75)
export default async function ShopDocumentsPage({ searchParams }: PageProps<"/shop/documents">) {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  const page = pageFrom(await searchParams);
  const where = { shopId: ctx.shop.id, status: { in: ["COMPLETED" as const, "PARTIALLY_ACCEPTED" as const] } };
  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, include: { supplier: true }, orderBy: { completedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return (
    <>
      <PageHeader title="Документы" />
      {rows.length === 0 ? <EmptyState>{t("Документы появятся после первой доставки")}</EmptyState> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-gray-100">
            {rows.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">№{o.number} · {o.supplier.displayName}</div>
                  <div className="text-xs text-gray-500">{t.date(o.completedAt)} · {t.money(o.total)}</div>
                </div>
                <div className="flex gap-3">
                  <Link className="text-brand-600" href={`/documents/orders/${o.id}/receipt`}>{t("Чек")}</Link>
                  <Link className="text-brand-600" href={`/documents/orders/${o.id}/invoice`}>{t("Накладная")}</Link>

                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination page={page} total={total} basePath="/shop/documents" params={{}} />
    </>
  );
}

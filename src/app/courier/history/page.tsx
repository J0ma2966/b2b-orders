import { EmptyState, PageHeader } from "@/components/ui";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { OrdersList } from "@/components/orders/order-view";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { CLOSED } from "@/lib/order-core";
import { getT } from "@/lib/i18n/server";

export default async function CourierHistory({ searchParams }: PageProps<"/courier/history">) {
  const t = await getT();
  const ctx = await requireSupplier(["COURIER"]);
  const page = pageFrom(await searchParams);
  const where = { supplierId: ctx.supplier.id, courierId: ctx.auth.user.id, status: { in: CLOSED } };
  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, include: { shop: true }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return (
    <>
      <PageHeader title="История доставок" />
      {rows.length === 0 ? <EmptyState>{t("Завершённых доставок пока нет")}</EmptyState> : <OrdersList rows={rows} href={(id) => `/courier/orders/${id}`} party={(o) => o.shop.name} />}
      <Pagination page={page} total={total} basePath="/courier/history" params={{}} />
    </>
  );
}

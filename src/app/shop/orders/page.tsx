import { ExportLink } from "@/components/ui/export-link";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { ShopOrderCards } from "@/components/shop/order-tracker";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { orderStatusFilter, ORDER_FILTERS } from "@/lib/order-core";
import { getT } from "@/lib/i18n/server";

export default async function ShopOrdersPage({ searchParams }: PageProps<"/shop/orders">) {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = pageFrom(sp);
  const where = { shopId: ctx.shop.id, status: orderStatusFilter(status) };
  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, include: { supplier: true }, orderBy: { placedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return (
    <>
      <PageHeader title="Заказы" actions={<ExportLink href={`/api/export/shop/orders?status=${status}`} />} />
      <FilterBar search={false} status={status} statuses={ORDER_FILTERS} allLabel="Все заказы" />
      {rows.length === 0 ? (
        <EmptyState>
          {t("Заказов нет.")} <Link href="/shop/suppliers" className="text-brand-600">{t("Выбрать поставщика")}</Link>

        </EmptyState>
      ) : (
        <ShopOrderCards rows={rows} />
      )}
      <Pagination page={page} total={total} basePath="/shop/orders" params={{ status }} />
    </>
  );
}

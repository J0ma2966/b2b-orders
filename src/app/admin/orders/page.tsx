import { ExportLink } from "@/components/ui/export-link";
import { EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { OrdersList } from "@/components/orders/order-view";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { orderStatusFilter, ORDER_FILTERS } from "@/lib/order-core";
import type { Prisma } from "@/generated/prisma/client";
import { getT } from "@/lib/i18n/server";

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const t = await getT();
  await requireSuperAdmin();
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = pageFrom(sp);
  const n = Number(q.replace(/^№/, ""));
  const where: Prisma.OrderWhereInput = {
    status: orderStatusFilter(status),
    ...(q && {
      OR: [
        ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []),
        { shop: { name: { contains: q, mode: "insensitive" as const } } },
        { supplier: { displayName: { contains: q, mode: "insensitive" as const } } },
      ],
    }),
  };
  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, include: { shop: true, supplier: true }, orderBy: { placedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return (
    <>
      <PageHeader title="Заказы" actions={<ExportLink href={`/api/export/admin/orders?status=${status}`} />} />
      <FilterBar q={q} status={status} statuses={ORDER_FILTERS} allLabel="Все заказы" placeholder="Номер, магазин, поставщик" />
      {rows.length === 0 ? (
        <EmptyState>{t("Заказов не найдено")}</EmptyState>
      ) : (
        <OrdersList rows={rows} href={(id) => `/admin/orders/${id}`} party={(o) => `${o.supplier.displayName} → ${o.shop.name}`} />
      )}
      <Pagination page={page} total={total} basePath="/admin/orders" params={{ q, status }} />
    </>
  );
}

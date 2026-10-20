import { EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { OrdersList } from "@/components/orders/order-view";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { orderStatusFilter, ORDER_FILTERS } from "@/lib/order-core";
import type { Prisma } from "@/generated/prisma/client";

export default async function SupplierOrdersPage({ searchParams }: PageProps<"/supplier/orders">) {
  const ctx = await requireActiveSupplier();
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "active";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = pageFrom(sp);
  const n = Number(q.replace(/^№/, ""));
  const where: Prisma.OrderWhereInput = {
    supplierId: ctx.supplier.id,
    status: orderStatusFilter(status),
    ...(q && { OR: [...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []), { shop: { name: { contains: q, mode: "insensitive" as const } } }] }),
  };
  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, include: { shop: true }, orderBy: { placedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return (
    <>
      <PageHeader title="Заказы" />
      <FilterBar q={q} status={status} statuses={ORDER_FILTERS} allLabel="Все заказы" placeholder="Номер или магазин" />
      {rows.length === 0 ? (
        <EmptyState>Заказов не найдено</EmptyState>
      ) : (
        <OrdersList rows={rows} href={(id) => `/supplier/orders/${id}`} party={(o) => o.shop.name} />
      )}
      <Pagination page={page} total={total} basePath="/supplier/orders" params={{ q, status }} />
    </>
  );
}

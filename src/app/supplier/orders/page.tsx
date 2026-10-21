import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { BULK_FORM, BulkBar } from "@/components/orders/bulk-bar";
import { paymentDue } from "@/lib/accounts";
import { FilterBar } from "@/components/ui/filter-bar";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { OrdersList } from "@/components/orders/order-view";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { CLOSED, orderStatusFilter, ORDER_FILTERS } from "@/lib/order-core";
import type { Prisma } from "@/generated/prisma/client";
import { getT } from "@/lib/i18n/server";

export default async function SupplierOrdersPage({ searchParams }: PageProps<"/supplier/orders">) {
  const t = await getT();
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
  const [total, rows, couriers] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, include: { shop: true, courier: true }, orderBy: { placedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.supplierMember.findMany({ where: { supplierId: ctx.supplier.id, role: "COURIER", isActive: true }, include: { user: true } }),
  ]);
  // Л1: заказ выше доступного кредита магазина — сколько нужно получить при доставке
  const overLimit = new Map<string, number>();
  await Promise.all(
    rows
      .filter((o) => !CLOSED.includes(o.status))
      .map(async (o) => {
        const due = await paymentDue(db, { id: o.id, shopId: o.shopId, supplierId: o.supplierId, total: Number(o.total), placedAt: o.placedAt });
        if (due.overLimit > 0) overLimit.set(o.id, due.overLimit);
      }),
  );
  return (
    <>
      <PageHeader title="Заказы" actions={<Link href="/documents/supplier/picking" className="text-sm text-brand-600">{t("Лист сборки")}</Link>} />
      <FilterBar q={q} status={status} statuses={ORDER_FILTERS} allLabel="Все заказы" placeholder="Номер или магазин" />
      {rows.length === 0 ? (
        <EmptyState>{t("Заказов не найдено")}</EmptyState>
      ) : (
        <>
          <BulkBar couriers={couriers.map((c) => ({ id: c.userId, name: c.user.fullName }))} />
          <OrdersList
            rows={rows}
            selectForm={BULK_FORM}
            href={(id) => `/supplier/orders/${id}`}
            party={(o) => o.shop.name}
            extra={(o) => (
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                {o.deliveryDate && <span className="text-gray-500">{t("доставка {date}", { date: t.date(o.deliveryDate) })}</span>}
                {o.courier && <span className="text-gray-500">{o.courier.fullName}</span>}
                {overLimit.has(o.id) && <span className="font-medium text-red-600">{t("выше лимита на {sum}", { sum: t.money(overLimit.get(o.id)) })}</span>}
              </div>
            )}
          />
        </>
      )}
      <Pagination page={page} total={total} basePath="/supplier/orders" params={{ q, status }} />
    </>
  );
}

import { ExportLink } from "@/components/ui/export-link";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { BULK_FORM, BulkBar } from "@/components/orders/bulk-bar";
import { paymentDue, supplierDebtStates } from "@/lib/accounts";
import { DebtFlag } from "@/components/supplier/debt";
import { FilterBar } from "@/components/ui/filter-bar";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { OrdersList } from "@/components/orders/order-view";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { CLOSED, orderStatusFilter, ORDER_FILTERS } from "@/lib/order-core";
import type { Prisma } from "@/generated/prisma/client";
import { getT } from "@/lib/i18n/server";
import { delivererWhere } from "@/lib/supplier-roles";

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
  const [total, rows, couriers, placedCount] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, include: { shop: true, courier: true }, orderBy: { placedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.supplierMember.findMany({ where: { supplierId: ctx.supplier.id, ...delivererWhere }, include: { user: true } }),
    db.order.count({ where: { supplierId: ctx.supplier.id, status: "PLACED" } }),
  ]);
  // Цвет денег магазина на новых заказах: просрочка — только с оплатой, долг в срок, переплата
  const debts = await supplierDebtStates(ctx.supplier.id, { shopIds: [...new Set(rows.filter((o) => o.status === "PLACED").map((o) => o.shopId))] });
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
      <PageHeader title="Заказы" actions={<><Link href="/documents/supplier/picking" className="text-sm text-brand-600">{t("Лист сборки")}</Link><ExportLink href={`/api/export/supplier/orders?status=${status}`} /></>} />
      {/* Телефон: вкладки «Новые · В работе · Готовы · Все» и поиск; полный фильтр и массовые действия — на компьютере */}
      <div className="mb-3 space-y-2.5 sm:hidden">
        <nav className="grid grid-cols-4 gap-1 rounded-2xl bg-gray-200/60 p-1" aria-label={t("Заказы")}>
          {MOBILE_TABS.map(([v, label]) => {
            const on = status === v;
            return (
              <Link
                key={v || "all"}
                href={`/supplier/orders?status=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                aria-current={on ? "page" : undefined}
                className={on ? "flex items-center justify-center gap-1 rounded-xl bg-surface py-2 text-[13px] font-semibold text-brand-700 shadow-sm" : "flex items-center justify-center gap-1 rounded-xl py-2 text-[13px] font-semibold text-gray-600"}
              >
                <span className="truncate">{t(label)}</span>
                {v === "PLACED" && placedCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] leading-4 text-on-brand">{placedCount}</span>}
              </Link>
            );
          })}
        </nav>
        <form action="/supplier/orders" role="search">
          <input type="hidden" name="status" value={status} />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t("Номер или магазин")}
            aria-label={t("Номер или магазин")}
            className="block w-full rounded-2xl border-0 bg-surface px-4 py-3 text-base ring-1 ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </form>
      </div>
      <div className="hidden sm:block">
        <FilterBar q={q} status={status} statuses={ORDER_FILTERS} allLabel="Все заказы" placeholder="Номер или магазин" />
      </div>
      {rows.length === 0 ? (
        <EmptyState>{t("Заказов не найдено")}</EmptyState>
      ) : (
        <>
          <div className="hidden sm:block">
            <BulkBar couriers={couriers.map((c) => ({ id: c.userId, name: c.user.fullName }))} />
          </div>
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
                {o.status === "PLACED" && debts.has(o.shopId) && <DebtFlag state={debts.get(o.shopId)!} t={t} className="mt-1.5 w-full" />}
              </div>
            )}
          />
        </>
      )}
      <Pagination page={page} total={total} basePath="/supplier/orders" params={{ q, status }} />
    </>
  );
}

const MOBILE_TABS: [string, string][] = [
  ["PLACED", "Новые"],
  ["active", "В работе"],
  ["READY", "Готовы"],
  ["", "Все"],
];

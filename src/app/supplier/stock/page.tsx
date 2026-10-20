import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { formatQty, unitName } from "@/lib/catalog";
import type { Prisma } from "@/generated/prisma/client";
import { getT } from "@/lib/i18n/server";

// Остатки: физический, резерв, доступный (ТЗ п. 18)
export default async function StockPage({ searchParams }: PageProps<"/supplier/stock">) {
  const t = await getT();
  const ctx = await requireActiveSupplier();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const filter = typeof sp.status === "string" ? sp.status : "";
  const page = pageFrom(sp);
  const where: Prisma.ProductUnitWhereInput = {
    product: { supplierId: ctx.supplier.id, archivedAt: null, ...(q && { name: { contains: q, mode: "insensitive" } }) },
    ...(filter === "empty" && { physicalQty: { lte: 0 } }),
    ...(filter === "reserved" && { reservedQty: { gt: 0 } }),
  };
  const [total, units] = await Promise.all([
    db.productUnit.count({ where }),
    db.productUnit.findMany({
      where,
      include: { product: true },
      orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return (
    <>
      <PageHeader title="Остатки" subtitle="Доступный остаток = физический − зарезервированный" />
      <FilterBar q={q} status={filter} allLabel="Все" statuses={[["empty", "Закончились"], ["reserved", "Есть резерв"]]} placeholder="Товар" />
      {units.length === 0 ? (
        <EmptyState>{t("Нет товаров")}</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">{t("Товар")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("Физический")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("Резерв")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("Доступно")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {units.map((u) => {
                const avail = Number(u.physicalQty) - Number(u.reservedQty);
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-2">
                      <Link href={`/supplier/catalog/${u.productId}`} className="hover:underline">{u.product.name}</Link>
                      <span className="text-gray-500"> · {t(unitName(u))}</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatQty(u.physicalQty)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatQty(u.reservedQty)}</td>
                    <td className={`px-4 py-2 text-right font-semibold tabular-nums ${avail <= 0 ? "text-red-600" : ""}`}>{formatQty(avail)}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/supplier/stock/${u.id}`} className="text-xs text-brand-600">{t("Журнал")}</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={page} total={total} basePath="/supplier/stock" params={{ q, status: filter }} />
    </>
  );
}

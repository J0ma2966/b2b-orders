import { Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { formatQty, unitName } from "@/lib/catalog";
import type { Prisma } from "@/generated/prisma/client";
import { getT } from "@/lib/i18n/server";

export default async function AdminStockPage({ searchParams }: PageProps<"/admin/stock">) {
  const t = await getT();
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = pageFrom(sp);
  const where: Prisma.ProductUnitWhereInput = {
    product: { archivedAt: null, ...(q && { OR: [{ name: { contains: q, mode: "insensitive" } }, { supplier: { displayName: { contains: q, mode: "insensitive" } } }] }) },
    ...(status === "reserved" && { reservedQty: { gt: 0 } }),
    ...(status === "empty" && { physicalQty: 0 }),
  };
  const [total, rows] = await Promise.all([
    db.productUnit.count({ where }),
    db.productUnit.findMany({ where, include: { product: { include: { supplier: true } }, baseUnit: true }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return (
    <>
      <PageHeader title="Остатки" subtitle="Доступно = физический − резерв" />
      <FilterBar q={q} status={status} statuses={[["reserved", "Есть резерв"], ["empty", "Закончились"]]} allLabel="Все" placeholder="Товар или поставщик" />
      {rows.length === 0 ? <EmptyState>{t("Нет данных")}</EmptyState> : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="stack-table w-full text-sm sm:min-w-[600px]">
            <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-4 py-2 text-left">{t("Товар")}</th><th className="px-2 text-left">{t("Поставщик")}</th><th className="px-2 text-right">{t("Физический")}</th><th className="px-2 text-right">{t("Резерв")}</th><th className="px-4 text-right">{t("Доступно")}</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 font-medium sm:font-normal">{u.product.name} · {t(unitName(u))}</td>
                  <td data-label={t("Поставщик")} className="px-2">{u.product.supplier.displayName}</td>
                  {u.baseUnit ? (
                    <td colSpan={2} data-label={t("Фасовка")} className="px-2 text-right text-xs text-gray-500">{t("1 = {n} {unit}", { n: formatQty(u.baseQty!), unit: t(unitName(u.baseUnit)) })}</td>
                  ) : (
                    <>
                      <td data-label={t("Физический")} className="px-2 text-right">{formatQty(u.physicalQty)}</td>
                      <td data-label={t("Резерв")} className="px-2 text-right">{formatQty(u.reservedQty)}</td>
                    </>
                  )}
                  <td data-label={t("Доступно")} className="px-4 text-right font-medium">{formatQty(Number(u.physicalQty) - Number(u.reservedQty))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={page} total={total} basePath="/admin/stock" params={{ q, status }} />
    </>
  );
}

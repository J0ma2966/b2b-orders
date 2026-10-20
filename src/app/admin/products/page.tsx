import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { unitName } from "@/lib/catalog";
import type { Prisma } from "@/generated/prisma/client";
import { getT } from "@/lib/i18n/server";

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const t = await getT();
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = pageFrom(sp);
  const where: Prisma.ProductWhereInput = {
    ...(status === "archived" ? { archivedAt: { not: null } } : status === "active" ? { archivedAt: null } : {}),
    ...(q && { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q } }, { supplier: { displayName: { contains: q, mode: "insensitive" } } }] }),
  };
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, include: { supplier: true, units: { orderBy: { sortOrder: "asc" } } }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return (
    <>
      <PageHeader title="Товары" />
      <FilterBar q={q} status={status} statuses={[["active", "В каталоге"], ["archived", "Удалены из каталога"]]} allLabel="Все" placeholder="Товар, артикул, поставщик" />
      {rows.length === 0 ? <EmptyState>{t("Товаров нет")}</EmptyState> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-gray-100">
            {rows.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{p.name}</div>
                  {p.archivedAt ? <Badge>{t("Удалён")}</Badge> : !p.isAvailable ? <Badge color="yellow">{t("Снят с продажи")}</Badge> : null}
                </div>
                <div className="text-xs text-gray-500">
                  <Link className="text-brand-600" href={`/admin/suppliers/${p.supplierId}`}>{p.supplier.displayName}</Link>
                  {" · "}{p.units.map((u) => `${t(unitName(u))} ${u.price ? t.money(u.price) : t("без цены")}`).join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination page={page} total={total} basePath="/admin/products" params={{ q, status }} />
    </>
  );
}

import Link from "next/link";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { formatQty, unitName } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { fileUrl } from "@/lib/storage-url";
import type { Prisma } from "@/generated/prisma/client";

export default async function CatalogPage({ searchParams }: PageProps<"/supplier/catalog">) {
  const ctx = await requireActiveSupplier();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const filter = typeof sp.status === "string" ? sp.status : "";
  const page = pageFrom(sp);
  const categories = await db.category.findMany({ where: { supplierId: ctx.supplier.id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const where: Prisma.ProductWhereInput = {
    supplierId: ctx.supplier.id,
    archivedAt: filter === "archived" ? { not: null } : null,
    ...(filter && filter !== "archived" && { categoryId: filter }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      include: { units: { orderBy: { sortOrder: "asc" } }, category: true },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return (
    <>
      <PageHeader title="Каталог" actions={<ButtonLink href="/supplier/catalog/new">+ Товар</ButtonLink>} />
      <FilterBar
        q={q}
        status={filter}
        allLabel="Все категории"
        statuses={[...categories.map((c) => [c.id, c.name] as [string, string]), ["archived", "🗄 Удалённые из каталога"]]}
        placeholder="Название, бренд, артикул"
      />
      {products.length === 0 ? (
        <EmptyState>{q || filter ? "Ничего не найдено" : "Каталог пуст. Добавьте первый товар."}</EmptyState>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-gray-100">
            {products.map((p) => {
              const photo = fileUrl(p.photoPaths[0]);
              return (
                <li key={p.id}>
                  <Link href={`/supplier/catalog/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                    {photo ? <img src={photo} alt="" className="size-12 shrink-0 rounded-lg object-cover" /> : <div className="size-12 shrink-0 rounded-lg bg-gray-100" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{p.name}</span>
                        {!p.isAvailable && <Badge color="yellow">Снят с продажи</Badge>}
                        {p.archivedAt && <Badge color="gray">Удалён</Badge>}
                      </div>
                      <div className="text-xs text-gray-500">
                        {[p.category?.name, p.brand, p.sku && `арт. ${p.sku}`].filter(Boolean).join(" · ")}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {p.units.map((u) => (
                          <span key={u.id} className={u.isActive ? "" : "text-gray-400 line-through"}>
                            {unitName(u)}: <b>{u.price ? formatMoney(u.price) : "без цены"}</b> · доступно {formatQty(Number(u.physicalQty) - Number(u.reservedQty))}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Pagination page={page} total={total} basePath="/supplier/catalog" params={{ q, status: filter }} />
    </>
  );
}

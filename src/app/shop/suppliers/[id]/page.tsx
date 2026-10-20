import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, EmptyState, Input, PageHeader, cn } from "@/components/ui";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { requireShop } from "@/lib/auth/current";
import { formatQty, unitName } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { shopCatalog, supplierForShop } from "@/lib/shop-catalog";
import { fileUrl } from "@/lib/storage-url";

export default async function ShopSupplierPage({ params, searchParams }: PageProps<"/shop/suppliers/[id]">) {
  const ctx = await requireShop();
  const { id } = await params;
  const sp = await searchParams;
  if (ctx.shop.isBlocked) notFound();
  const supplier = await supplierForShop(ctx.shop.territoryId, id);
  if (!supplier) notFound();
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const categoryId = typeof sp.c === "string" ? sp.c : "";
  const page = pageFrom(sp);
  const { total, products, categories } = await shopCatalog(supplier.id, { q, categoryId, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  const logo = fileUrl(supplier.logoPath);
  const base = `/shop/suppliers/${supplier.id}`;
  return (
    <>
      <PageHeader
        title={supplier.displayName}
        subtitle={
          <span className="flex items-center gap-2">
            {logo && <img src={logo} alt="" className="size-6 rounded object-cover" />}
            <a href={`tel:${supplier.phone}`} className="text-brand-600">{formatPhone(supplier.phone)}</a>
          </span>
        }
      />
      {supplier.ordersDisabled && <div className="mb-4"><Alert tone="warning">Поставщик временно не принимает новые заказы.</Alert></div>}
      <form className="mb-3 flex gap-2">
        {categoryId && <input type="hidden" name="c" value={categoryId} />}
        <Input name="q" defaultValue={q} placeholder="Поиск товара" aria-label="Поиск товара" />
      </form>
      {categories.length > 0 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link href={q ? `${base}?q=${encodeURIComponent(q)}` : base} className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm", !categoryId ? "bg-brand-600 text-white" : "bg-white ring-1 ring-gray-200")}>
            Все
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`${base}?c=${c.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm whitespace-nowrap", categoryId === c.id ? "bg-brand-600 text-white" : "bg-white ring-1 ring-gray-200")}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}
      {products.length === 0 ? (
        <EmptyState>{q || categoryId ? "Ничего не найдено" : "Каталог поставщика пока пуст"}</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => {
            const photo = fileUrl(p.photoPaths[0]);
            return (
              <Link key={p.id} href={`${base}/products/${p.id}`} className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 hover:ring-brand-500">
                {photo ? <img src={photo} alt="" className="aspect-square w-full object-cover" /> : <div className="aspect-square w-full bg-gray-100" />}
                <div className="flex flex-1 flex-col p-2.5">
                  <div className="line-clamp-2 text-sm font-medium">{p.name}</div>
                  <div className="mt-auto space-y-0.5 pt-1">
                    {p.units.map((u) => {
                      const avail = Number(u.physicalQty) - Number(u.reservedQty);
                      return (
                        <div key={u.id} className="text-xs">
                          <b>{formatMoney(u.price)}</b> / {unitName(u)}
                          <span className={avail > 0 ? " text-gray-500" : " text-red-600"}>{avail > 0 ? ` · ${formatQty(avail)}` : " · нет"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <Pagination page={page} total={total} basePath={base} params={{ q, c: categoryId }} />
    </>
  );
}

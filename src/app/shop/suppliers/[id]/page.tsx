import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, ButtonLink, EmptyState, Input, cn } from "@/components/ui";
import { ProductCard } from "@/components/shop/product-card";
import { db } from "@/lib/db";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { requireShop } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";
import { formatPhone } from "@/lib/phone";
import { activePromotions, favoriteIds, shopCatalog, supplierForShop, type CatalogFilter } from "@/lib/shop-catalog";
import { fileUrl } from "@/lib/storage-url";

export default async function ShopSupplierPage({ params, searchParams }: PageProps<"/shop/suppliers/[id]">) {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  const { id } = await params;
  const sp = await searchParams;
  if (ctx.shop.isBlocked) notFound();
  const supplier = await supplierForShop(ctx.shop.territoryId, id);
  if (!supplier) notFound();
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const categoryId = typeof sp.c === "string" ? sp.c : "";
  const filter = (["fav", "often", "promo"].includes(String(sp.f)) ? sp.f : "") as CatalogFilter;
  const page = pageFrom(sp);
  const { total, products, categories } = await shopCatalog(supplier.id, { q, categoryId, filter, shopId: ctx.shop.id, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  const [promos, favs] = await Promise.all([activePromotions(supplier.id), favoriteIds(ctx.shop.id, products.map((p) => p.id))]);
  const logo = fileUrl(supplier.logoPath);
  const cartCount = await db.orderItem.count({ where: { order: { shopId: ctx.shop.id, supplierId: supplier.id, status: "DRAFT" } } });
  const base = `/shop/suppliers/${supplier.id}`;
  return (
    <>
      <div className="mb-5 flex items-center gap-4">
        {logo ? (
          <img src={logo} alt="" className="size-12 shrink-0 rounded-2xl object-cover ring-1 ring-black/5 sm:size-16" />
        ) : (
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-600 font-display text-xl sm:size-16 sm:text-2xl font-semibold text-on-brand" aria-hidden>
            {supplier.displayName.replace(/^(ООО|ИП|ЧП|МЧЖ|XK|OOO)\s*/i, "").replace(/[«"]/g, "").slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg leading-tight font-semibold sm:text-2xl">{supplier.displayName}</h1>
          <a href={`tel:${supplier.phone}`} className="text-sm text-brand-700">{formatPhone(supplier.phone)}</a>
        </div>
        <ButtonLink href={`/shop/cart/${supplier.id}`} variant={cartCount ? "primary" : "secondary"} className="shrink-0 rounded-full">
          <span aria-hidden>🛒</span>
          <span className="sr-only sm:not-sr-only">{t("Корзина")}</span>
          {cartCount > 0 && <span className="tabular-nums">{cartCount}</span>}
        </ButtonLink>
      </div>
      {supplier.ordersDisabled && <div className="mb-4"><Alert tone="warning">{t("Поставщик временно не принимает новые заказы.")}</Alert></div>}
      <form className="mb-3 flex gap-2" role="search">
        {categoryId && <input type="hidden" name="c" value={categoryId} />}
        <Input name="q" type="search" defaultValue={q} placeholder={t("Поиск в каталоге поставщика")} aria-label={t("Поиск товара")} className="rounded-full px-4" />
      </form>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {([["", "Весь каталог"], ["fav", "★ Мои товары"], ["often", "Часто заказываю"], ["promo", "🎁 С акцией"]] as const).map(([f, label]) => (
          <Link
            key={f}
            href={f ? `${base}?f=${f}` : base}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm whitespace-nowrap", filter === f ? "bg-ink text-page" : "text-gray-600 ring-1 ring-black/10")}
          >
            {t(label)}
          </Link>
        ))}
      </div>
      {categories.length > 0 && (
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link href={q ? `${base}?q=${encodeURIComponent(q)}` : base} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium", !categoryId ? "bg-brand-600 text-on-brand" : "bg-surface ring-1 ring-black/10")}>
            {t("Все")}
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`${base}?c=${c.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap", categoryId === c.id ? "bg-brand-600 text-on-brand" : "bg-surface ring-1 ring-black/10")}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}
      {products.length === 0 ? (
        <EmptyState>
          {filter === "fav"
            ? t("Отметьте товары звёздочкой — они появятся здесь.")
            : filter === "often"
              ? t("Здесь появятся товары, которые вы заказываете чаще всего.")
              : filter === "promo"
                ? t("Сейчас акций нет")
                : q || categoryId
                  ? t("Ничего не найдено")
                  : t("Каталог поставщика пока пуст")}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} p={p} supplierId={supplier.id} href={`${base}/products/${p.id}`} canOrder={!supplier.ordersDisabled} promos={promos} favorite={favs.has(p.id)} />
          ))}
        </div>
      )}
      <Pagination page={page} total={total} basePath={base} params={{ q, c: categoryId, f: filter }} />
    </>
  );
}

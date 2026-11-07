import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, EmptyState, Input, cn } from "@/components/ui";
import { ProductRow } from "@/components/shop/product-card";
import { CartSummaryBar, SupplierHero } from "@/components/shop/supplier-parts";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { requireShop } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";
import { activePromotions, cartQtyByUnit, shopCatalog, supplierForShop, type CatalogFilter } from "@/lib/shop-catalog";

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
  const [promos, inCart] = await Promise.all([activePromotions(supplier.id), cartQtyByUnit(ctx.shop.id, products.flatMap((p) => p.units.map((u) => u.id)))]);
  const base = `/shop/suppliers/${supplier.id}`;
  return (
    <>
      <SupplierHero supplier={supplier} shop={ctx.shop} subtitle={supplier.description ?? categories.slice(0, 3).map((c) => c.name).join(" · ")} />
      {supplier.ordersDisabled && <div className="mb-4"><Alert tone="warning">{t("Поставщик временно не принимает новые заказы.")}</Alert></div>}
      <form className="mb-3 flex gap-2" role="search">
        {categoryId && <input type="hidden" name="c" value={categoryId} />}
        <Input name="q" type="search" defaultValue={q} placeholder={t("Поиск в каталоге поставщика")} aria-label={t("Поиск товара")} className="rounded-full bg-surface px-5 py-3 ring-0" />
      </form>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {([["", "Весь каталог"], ["fav", "★ Мои товары"], ["often", "Часто заказываю"], ["promo", "🎁 С акцией"]] as const).map(([f, label]) => (
          <Link
            key={f}
            href={f ? `${base}?f=${f}` : base}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm whitespace-nowrap", filter === f ? "bg-night text-white" : "text-gray-600 ring-1 ring-black/10")}
          >
            {t(label)}
          </Link>
        ))}
      </div>
      {categories.length > 0 && (
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link href={q ? `${base}?q=${encodeURIComponent(q)}` : base} className={cn("shrink-0 rounded-full px-5 py-2.5 text-[15px] font-bold", !categoryId ? "bg-night text-lime" : "bg-surface")}>
            {t("Все")}
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`${base}?c=${c.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cn("shrink-0 rounded-full px-5 py-2.5 text-[15px] font-bold whitespace-nowrap", categoryId === c.id ? "bg-night text-lime" : "bg-surface")}
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
        <div className="grid gap-2.5 md:grid-cols-2">
          {products.map((p) => (
            <ProductRow key={p.id} p={p} supplierId={supplier.id} href={`${base}/products/${p.id}`} canOrder={!supplier.ordersDisabled} promos={promos} cart={inCart} />
          ))}
        </div>
      )}
      <Pagination page={page} total={total} basePath={base} params={{ q, c: categoryId, f: filter }} />
      {!supplier.ordersDisabled && <CartSummaryBar supplierId={supplier.id} shopId={ctx.shop.id} shopTerritoryId={ctx.shop.territoryId} />}
    </>
  );
}

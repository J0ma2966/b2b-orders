import Link from "next/link";
import { Alert, EmptyState, cn } from "@/components/ui";
import { ProductCard } from "@/components/shop/product-card";
import { CategoryTiles, HomeHero, SupplierStrip } from "@/components/shop/home";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { requireShop } from "@/lib/auth/current";
import { availableSuppliersForShop } from "@/lib/territory";
import { db } from "@/lib/db";
import { orderStatusFilter } from "@/lib/order-core";
import { getT } from "@/lib/i18n/server";
import { activePromotions, cartQtyByUnit, favoriteIds, shopFeed, type CatalogFilter, type FeedSort } from "@/lib/shop-catalog";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim().slice(0, 100) : "");

// Главная магазина — лента товаров всех поставщиков, которые доставляют в его район
export default async function ShopHome({ searchParams }: PageProps<"/shop">) {
  const [ctx, t, sp] = await Promise.all([requireShop(), getT(), searchParams]);
  const shop = ctx.shop;
  if (shop.isBlocked) return <Alert tone="error">{t("Магазин заблокирован администратором платформы. Заказы недоступны.")}</Alert>;

  const q = str(sp.q);
  const category = str(sp.c);
  const supplierId = str(sp.s);
  const filter = (["fav", "often", "promo"].includes(String(sp.f)) ? sp.f : "") as CatalogFilter;
  const sort: FeedSort = sp.sort === "name" ? "name" : "new";
  const page = pageFrom(sp);
  const narrowed = !!(q || category || supplierId || filter || page > 1);

  const suppliers = await availableSuppliersForShop(shop.territoryId);
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const ids = suppliers.map((s) => s.id);
  const [{ total, products, categories }, promos, activeCount, carts] = await Promise.all([
    shopFeed(ids, { q, category, supplierId, filter, sort, shopId: shop.id, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    activePromotions(ids),
    narrowed ? 0 : db.order.count({ where: { shopId: shop.id, status: orderStatusFilter("active") } }),
    narrowed
      ? []
      : db.order.findMany({
          where: { shopId: shop.id, status: "DRAFT", items: { some: {} } },
          include: { supplier: true, _count: { select: { items: true } } },
          orderBy: { updatedAt: "desc" },
        }),
  ]);
  const [favs, inCart] = await Promise.all([
    favoriteIds(shop.id, products.map((p) => p.id)),
    cartQtyByUnit(shop.id, products.flatMap((p) => p.units.map((u) => u.id))),
  ]);

  const params = { q, c: category, s: supplierId, f: filter, sort: sort === "new" ? "" : sort };
  const href = (over: Partial<typeof params>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...over })) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/shop?${s}` : "/shop";
  };
  const chip = (on: boolean) => cn("shrink-0 rounded-full px-3 py-1.5 text-sm whitespace-nowrap", on ? "bg-ink text-page" : "text-gray-600 ring-1 ring-black/10");
  const pill = (on: boolean) => cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap", on ? "bg-brand-600 text-on-brand" : "bg-surface ring-1 ring-black/10");

  return (
    <div className="space-y-7">
      <HomeHero shop={shop} userId={ctx.auth.user.id} q={q} />
      {!narrowed && suppliers.length > 0 && (
        <>
          <CategoryTiles categories={categories} hrefFor={(name) => href({ c: name })} />
          <SupplierStrip suppliers={suppliers} shopTerritoryId={shop.territoryId} />
        </>
      )}
      {(carts.length > 0 || activeCount > 0) && (
        <div className="-mx-4 hidden gap-2 overflow-x-auto px-4 pb-1 md:flex">
          {carts.map((c) => (
            <Link
              key={c.id}
              href={`/shop/cart/${c.supplierId}`}
              className="flex shrink-0 items-center gap-2 rounded-full bg-accent/15 py-1.5 pr-1.5 pl-3 text-sm ring-1 ring-accent/40 hover:ring-accent"
            >
              <span aria-hidden>🛒</span>
              <span className="max-w-28 truncate font-medium sm:max-w-40">{c.supplier.displayName}</span>
              <span className="font-bold tabular-nums">{t.money(c.total)}</span>
              <span className="rounded-full bg-accent px-2.5 py-0.5 font-semibold text-on-accent">{t("Оформить")}</span>
            </Link>
          ))}
          {activeCount > 0 && (
            <Link href="/shop/orders" className="flex shrink-0 items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-black/10 hover:ring-brand-600">
              <span aria-hidden>📦</span>
              {t("Заказы в работе")}
              <span className="rounded-full bg-brand-600 px-2 text-xs font-bold text-on-brand tabular-nums">{activeCount}</span>
            </Link>
          )}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-bold sm:text-2xl">{t("Лента товаров")}</h2>
          <Link href="/shop/suppliers" className="shrink-0 text-sm font-medium text-brand-700">{t("Поставщики ({n})", { n: suppliers.length })}</Link>
        </div>

        {suppliers.length === 0 ? (
          <EmptyState>{t("Пока ни один поставщик не доставляет в ваш район. Мы сообщим, когда появятся.")}</EmptyState>
        ) : (
          <>
            {q && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-600">{t("Поиск: «{q}»", { q })}</span>
                <Link href={href({ q: "" })} className="rounded-full px-2.5 py-1 text-gray-600 ring-1 ring-black/10 hover:text-red-700">
                  {t("Сбросить")} ✕
                </Link>
              </div>
            )}
            <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
              {([["", "Все товары"], ["fav", "★ Мои товары"], ["often", "Часто заказываю"], ["promo", "🎁 С акцией"]] as const).map(([f, label]) => (
                <Link key={f} href={href({ f, c: "" })} className={chip(filter === f)}>
                  {t(label)}
                </Link>
              ))}
              <span className="mx-1 w-px shrink-0 bg-black/10" aria-hidden />
              <Link href={href({ sort: "" })} className={chip(sort === "new")}>{t("Сначала новые")}</Link>
              <Link href={href({ sort: "name" })} className={chip(sort === "name")}>{t("По названию")}</Link>
            </div>

            {suppliers.length > 1 && (
              <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
                <Link href={href({ s: "", c: "" })} className={pill(!supplierId)}>{t("Все поставщики")}</Link>
                {suppliers.map((s) => (
                  <Link key={s.id} href={href({ s: s.id, c: "" })} className={pill(supplierId === s.id)}>
                    {s.displayName}
                  </Link>
                ))}
              </div>
            )}

            {categories.length > 0 && (
              <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
                <Link href={href({ c: "" })} className={pill(!category)}>{t("Все категории")}</Link>
                {categories.map((name) => (
                  <Link key={name} href={href({ c: name })} className={pill(category === name)}>
                    {name}
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
                      : q || category || supplierId
                        ? t("Ничего не найдено")
                        : t("Поставщики ещё не добавили товары")}
              </EmptyState>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {products.map((p) => {
                  const s = supplierById.get(p.supplierId)!;
                  const base = `/shop/suppliers/${s.id}`;
                  return (
                    <ProductCard
                      key={p.id}
                      p={p}
                      supplierId={s.id}
                      href={`${base}/products/${p.id}`}
                      canOrder={!s.ordersDisabled}
                      promos={promos}
                      favorite={favs.has(p.id)}
                      supplier={{ name: s.displayName, href: base }}
                      cart={inCart}
                    />
                  );
                })}
              </div>
            )}
            <Pagination page={page} total={total} basePath="/shop" params={params} />
          </>
        )}
      </section>
    </div>
  );
}

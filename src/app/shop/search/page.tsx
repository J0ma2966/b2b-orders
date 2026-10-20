import Link from "next/link";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { ProductCard } from "@/components/shop/product-card";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";
import { shopVisibleProduct, shopVisibleUnits } from "@/lib/shop-catalog";
import { availableSuppliersForShop } from "@/lib/territory";

const LIMIT = 60;

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Поиск товаров") };
}

// Поиск товара сразу у всех поставщиков, которые доставляют магазину
export default async function ShopSearchPage({ searchParams }: PageProps<"/shop/search">) {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  if (ctx.shop.isBlocked) return <Alert tone="error">{t("Магазин заблокирован администратором платформы.")}</Alert>;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const suppliers = await availableSuppliersForShop(ctx.shop.territoryId);
  const products =
    q.length >= 2
      ? await db.product.findMany({
          where: {
            OR: suppliers.map((s) => shopVisibleProduct(s.id)),
            AND: [{ OR: [{ name: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }] }],
          },
          include: { units: shopVisibleUnits },
          orderBy: { name: "asc" },
          take: LIMIT,
        })
      : [];
  const bySupplier = suppliers
    .map((s) => ({ supplier: s, items: products.filter((p) => p.supplierId === s.id) }))
    .filter((g) => g.items.length > 0);
  return (
    <>
      <PageHeader
        title={q ? t("Поиск: «{q}»", { q }) : "Поиск товаров"}
        subtitle={q.length >= 2 ? t("Найдено товаров: {n}", { n: products.length }) : "Введите название товара или бренда, минимум 2 буквы"}
      />
      {q.length >= 2 && bySupplier.length === 0 && (
        <EmptyState>
          {t("Ничего не нашлось. Попробуйте другое слово или откройте каталог поставщика.")}{" "}
          <Link href="/shop/suppliers" className="font-medium text-brand-700">{t("Поставщики")}</Link>
        </EmptyState>
      )}
      <div className="space-y-8">
        {bySupplier.map(({ supplier, items }) => (
          <section key={supplier.id}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">{supplier.displayName}</h2>
              <Link href={`/shop/suppliers/${supplier.id}?q=${encodeURIComponent(q)}`} className="shrink-0 text-sm font-medium text-brand-700">{t("В каталоге поставщика")}</Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((p) => (
                <ProductCard key={p.id} p={p} supplierId={supplier.id} href={`/shop/suppliers/${supplier.id}/products/${p.id}`} canOrder={!supplier.ordersDisabled} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

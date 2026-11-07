import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/components/ui";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { formatQty, unitName } from "@/lib/catalog";
import { getT } from "@/lib/i18n/server";
import { cartQtyByUnit, favoriteIds, shopVisibleProduct, shopVisibleUnits, supplierForShop } from "@/lib/shop-catalog";
import { fileUrl } from "@/lib/storage-url";
import { allowsFraction } from "@/lib/order-core";
import { FavoriteButton, ProductBuy, type BuyUnit } from "@/components/orders/shop-forms";
import { Avatar, BackButton, initials, tileColor } from "@/components/shop/ui";

export default async function ShopProductPage({ params }: PageProps<"/shop/suppliers/[id]/products/[productId]">) {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  const { id, productId } = await params;
  if (ctx.shop.isBlocked) notFound();
  const supplier = await supplierForShop(ctx.shop.territoryId, id);
  if (!supplier) notFound();
  const product = await db.product.findFirst({
    where: { id: productId, ...shopVisibleProduct(supplier.id) },
    include: { units: shopVisibleUnits, category: true },
  });
  if (!product) notFound();
  const attrs = Array.isArray(product.attributes) ? (product.attributes as { name: string; value: string }[]) : [];
  const [inCart, favs] = await Promise.all([cartQtyByUnit(ctx.shop.id, product.units.map((u) => u.id)), favoriteIds(ctx.shop.id, [product.id])]);
  const photos = product.photoPaths.map((p) => fileUrl(p)!);
  const main = product.units[0];
  const units: BuyUnit[] = product.units.map((u) => {
    const base = u.baseUnitId ? product.units.find((b) => b.id === u.baseUnitId) : null;
    const label = t(unitName(u));
    return {
      id: u.id,
      label: base && u.baseQty ? t("{unit} по {n} {base}", { unit: label, n: formatQty(u.baseQty), base: t(unitName(base)) }) : label,
      price: Number(u.price),
      priceText: t.money(u.price),
      avail: Math.max(0, Number(u.physicalQty) - Number(u.reservedQty)),
      inCart: inCart.get(u.id) ?? 0,
      fraction: allowsFraction(u.kind),
    };
  });
  const facts = [
    ["Категория", product.category?.name],
    ["Бренд", product.brand],
    ["Вес", product.weightKg ? `${formatQty(product.weightKg)} ${t("кг")}` : null],
    ...attrs.map((a) => [a.name, a.value || t("да")]),
  ].filter((f): f is [string, string] => !!f[1]);
  const base = `/shop/suppliers/${supplier.id}`;
  return (
    <div className="space-y-5 md:mx-auto md:max-w-2xl">
      <section
        className={cn(
          "relative -mx-4 -mt-[max(1.25rem,env(safe-area-inset-top))] overflow-hidden rounded-b-[2rem] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-5 md:mx-0 md:mt-0 md:rounded-[2rem] md:pt-4",
          tileColor(supplier.displayName),
        )}
      >
        <div className="relative z-10 flex items-center justify-between pt-2">
          <BackButton href={base} label={t("Назад")} />
          <FavoriteButton productId={product.id} on={favs.has(product.id)} label={product.name} heart />
        </div>
        <div className="mx-auto -mt-4 grid aspect-square w-[78%] max-w-80 place-items-center overflow-hidden rounded-full bg-white/40">
          {photos[0] ? (
            <img src={photos[0]} alt="" className="size-full object-cover" />
          ) : (
            <span className="font-display text-6xl font-bold text-night/40">{initials(product.name)}</span>
          )}
        </div>
        {photos.length > 1 && (
          <div className="mt-3 flex justify-center gap-2">
            {photos.slice(1, 5).map((src) => (
              <img key={src} src={src} alt="" className="size-12 rounded-xl object-cover ring-2 ring-white/60" />
            ))}
          </div>
        )}
        <Link href={base} className="mt-3 inline-flex items-center gap-2 rounded-full bg-night py-1.5 pr-4 pl-1.5 text-sm font-bold text-white">
          <Avatar name={supplier.displayName} className="size-8 rounded-full text-[11px]" />
          {supplier.displayName}
        </Link>
      </section>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-tight">{product.name}</h1>
          {product.description && <p className="mt-1 line-clamp-2 text-gray-500">{product.description}</p>}
        </div>
        {main && (
          <div className="shrink-0 text-right">
            <div className="font-display text-[1.75rem] leading-tight font-bold tabular-nums">{t.money(main.price).replace(/\s\S+$/, "")}</div>
            <div className="text-sm font-semibold text-gray-500">{t.money(0).replace(/^0\s/, "")} / {t(unitName(main))}</div>
          </div>
        )}
      </div>

      <ProductBuy supplierId={supplier.id} units={units} canOrder={!supplier.ordersDisabled} />

      {facts.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-[1.25rem] bg-surface px-4 py-3">
              <div className="text-sm text-gray-500">{t(k)}</div>
              <div className="font-bold">{v}</div>
            </div>
          ))}
        </div>
      )}
      {product.description && <p className="text-sm whitespace-pre-line text-gray-700">{product.description}</p>}
    </div>
  );
}

import Link from "next/link";
import { CartStepper, FavoriteButton } from "@/components/orders/shop-forms";
import { formatQty, unitName } from "@/lib/catalog";
import { getT } from "@/lib/i18n/server";
import { fileUrl } from "@/lib/storage-url";
import { cn } from "@/components/ui";
import { initials, tileColor } from "./ui";
import type { UnitKind } from "@/generated/prisma/enums";

type Unit = {
  id: string;
  kind: UnitKind;
  customName: string;
  price: { toString(): string } | null;
  physicalQty: { toString(): string };
  reservedQty: { toString(): string };
  baseUnitId?: string | null;
  baseQty?: { toString(): string } | null;
};
type Product = { id: string; name: string; photoPaths: string[]; units: Unit[] };

// Карточка товара на витрине: фото, цена за каждую единицу продажи и кнопка «+» в корзину
export type PromoBadge = { name: string; triggerQty: { toString(): string }; giftQty: { toString(): string }; giftUnitId: string; triggerUnitId: string };

// Короткая надпись акции: «10+1», если подарок — тот же товар, иначе «подарок»
export function promoLabel(p: PromoBadge) {
  return p.giftUnitId === p.triggerUnitId ? `${formatQty(p.triggerQty)}+${formatQty(p.giftQty)}` : null;
}

export async function ProductCard({
  p,
  supplierId,
  href,
  canOrder = true,
  promos,
  favorite,
  supplier,
  cart,
}: {
  p: Product;
  supplierId: string;
  href: string;
  canOrder?: boolean;
  promos?: Map<string, PromoBadge>;
  favorite?: boolean;
  // В ленте на главной — у какого поставщика товар
  supplier?: { name: string; href: string };
  // Сколько каждой единицы уже в корзине (счётчик «− N +»)
  cart?: Map<string, number>;
}) {
  const t = await getT();
  const photo = fileUrl(p.photoPaths[0]);
  const promo = p.units.map((u) => promos?.get(u.id)).find(Boolean);
  return (
    <div className="relative flex flex-col overflow-hidden rounded-[1.5rem] bg-surface">
      {promo && (
        <span title={promo.name} className="absolute top-2 left-2 z-[1] rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent shadow-sm">
          🎁 {promoLabel(promo) ? t("Акция {n}", { n: promoLabel(promo) }) : t("Подарок")}
        </span>
      )}
      {favorite !== undefined && (
        <div className="absolute top-2 right-2 z-[1]">
          <FavoriteButton productId={p.id} on={favorite} label={p.name} />
        </div>
      )}
      <Link href={href} className="group block">
        {photo ? (
          <img src={photo} alt="" className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-[1.02]" />
        ) : (
          <div className="grid aspect-[4/3] w-full place-items-center bg-brand-50 font-display text-3xl font-semibold text-brand-600/40" aria-hidden>
            {p.name.slice(0, 1)}
          </div>
        )}
        <div className="line-clamp-2 min-h-10 px-3 pt-2.5 text-sm leading-5 font-medium group-hover:text-brand-700">{p.name}</div>
      </Link>
      {supplier && (
        <Link href={supplier.href} className="truncate px-3 pt-1 text-xs text-gray-500 hover:text-brand-700">
          {supplier.name}
        </Link>
      )}
      <ul className="mt-auto space-y-1.5 px-3 pt-2 pb-3">
        {p.units.map((u) => {
          const avail = Number(u.physicalQty) - Number(u.reservedQty);
          const unit = t(unitName(u));
          return (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
              <div className="min-w-0 leading-tight">
                <div className="text-[15px] font-bold tabular-nums">{t.money(u.price)}</div>
                <div className={avail > 0 ? "truncate text-xs text-gray-500" : "truncate text-xs text-red-600"}>
                  {unit} ·{" "}
                  {avail > 0 ? (
                    <>
                      <span className="sm:hidden">{formatQty(avail)}</span>
                      <span className="hidden sm:inline">{t("в наличии {qty}", { qty: formatQty(avail) })}</span>
                    </>
                  ) : (
                    t("нет в наличии")
                  )}
                </div>
              </div>
              {canOrder && (avail > 0 || (cart?.get(u.id) ?? 0) > 0) && (
                <CartStepper supplierId={supplierId} unitId={u.id} qty={cart?.get(u.id) ?? 0} max={avail} label={`${p.name}, ${unit}`} unit={unit} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Строка товара в каталоге поставщика (телефон, макет): плитка-картинка, название, по каждой единице — цена и счётчик
export async function ProductRow({
  p,
  supplierId,
  href,
  canOrder = true,
  promos,
  cart,
}: {
  p: Product;
  supplierId: string;
  href: string;
  canOrder?: boolean;
  promos?: Map<string, PromoBadge>;
  cart?: Map<string, number>;
}) {
  const t = await getT();
  const photo = fileUrl(p.photoPaths[0]);
  const promo = p.units.map((u) => promos?.get(u.id)).find(Boolean);
  return (
    <div className="flex gap-3 rounded-[1.5rem] bg-surface p-2.5">
      <Link href={href} className={cn("relative grid size-[5.25rem] shrink-0 place-items-center overflow-hidden rounded-2xl", !photo && tileColor(p.name))}>
        {photo ? <img src={photo} alt="" className="size-full object-cover" /> : <span className="font-display text-xl font-bold text-night/70">{initials(p.name)}</span>}
        {promo && (
          <span title={promo.name} className="absolute bottom-1 left-1 rounded-full bg-night px-1.5 py-0.5 text-[10px] font-bold text-lime">
            {promoLabel(promo) ?? "🎁"}
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1 self-center py-0.5">
        <Link href={href} className="line-clamp-2 text-[15px] leading-snug font-bold">{p.name}</Link>
        <ul className="mt-1 space-y-2">
          {p.units.map((u) => {
            const avail = Number(u.physicalQty) - Number(u.reservedQty);
            const unit = t(unitName(u));
            const base = u.baseUnitId ? p.units.find((b) => b.id === u.baseUnitId) : null;
            const inCart = cart?.get(u.id) ?? 0;
            return (
              <li key={u.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0 leading-tight">
                  <div className={cn("truncate text-[13px]", avail > 0 ? "text-gray-500" : "text-red-600")}>
                    {base && u.baseQty ? t("{unit} по {n} {base}", { unit, n: formatQty(u.baseQty), base: t(unitName(base)) }) : unit}
                    {avail <= 0 && ` · ${t("нет в наличии")}`}
                  </div>
                  <div className="font-display text-[17px] font-bold tabular-nums">
                    {t.money(u.price).replace(/\s(\S+)$/, "")} <span className="font-sans text-xs font-semibold text-gray-500">{t.money(0).replace(/^0\s/, "")}</span>
                  </div>
                </div>
                {canOrder && (avail > 0 || inCart > 0) && <CartStepper supplierId={supplierId} unitId={u.id} qty={inCart} max={avail} label={`${p.name}, ${unit}`} unit={unit} row />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

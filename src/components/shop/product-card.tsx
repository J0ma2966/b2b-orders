import Link from "next/link";
import { FavoriteButton, QuickAddButton } from "@/components/orders/shop-forms";
import { formatQty, unitName } from "@/lib/catalog";
import { getT } from "@/lib/i18n/server";
import { fileUrl } from "@/lib/storage-url";
import type { UnitKind } from "@/generated/prisma/enums";

type Unit = { id: string; kind: UnitKind; customName: string; price: { toString(): string } | null; physicalQty: { toString(): string }; reservedQty: { toString(): string } };
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
}: {
  p: Product;
  supplierId: string;
  href: string;
  canOrder?: boolean;
  promos?: Map<string, PromoBadge>;
  favorite?: boolean;
}) {
  const t = await getT();
  const photo = fileUrl(p.photoPaths[0]);
  const promo = p.units.map((u) => promos?.get(u.id)).find(Boolean);
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5">
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
      <ul className="mt-auto space-y-1.5 px-3 pt-2 pb-3">
        {p.units.map((u) => {
          const avail = Number(u.physicalQty) - Number(u.reservedQty);
          const unit = t(unitName(u));
          return (
            <li key={u.id} className="flex items-center justify-between gap-2">
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
              {canOrder && avail > 0 && <QuickAddButton supplierId={supplierId} unitId={u.id} label={`${p.name}, ${unit}`} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { WEEKDAY_SHORT } from "@/lib/order-core";
import { supplierTermsForShop } from "@/lib/supplier-terms";
import { cn } from "@/components/ui";
import { BackButton, Chip, Money, Progress, tileColor } from "./ui";

type Supplier = { id: string; displayName: string; phone: string; description: string | null };

// Цветная шапка поставщика (макет): «Назад», звонок, название, условия чипами
export async function SupplierHero({ supplier, shop, subtitle }: { supplier: Supplier; shop: { id: string; territoryId: string }; subtitle?: string }) {
  const t = await getT();
  const [terms, account] = await Promise.all([
    supplierTermsForShop(db, supplier.id, shop.territoryId),
    db.shopAccount.findUnique({ where: { shopId_supplierId: { shopId: shop.id, supplierId: supplier.id } }, select: { creditAllowed: true, creditLimit: true } }),
  ]);
  const days = terms.weekdays;
  return (
    <section
      className={cn(
        "relative -mx-4 -mt-[max(1.25rem,env(safe-area-inset-top))] mb-5 overflow-hidden rounded-b-[2rem] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6 text-night md:mx-0 md:mt-0 md:rounded-[2rem] md:pt-4",
        tileColor(supplier.displayName),
      )}
    >
      <span aria-hidden className="pointer-events-none absolute -top-6 -right-24 size-72 rounded-full border-[3.25rem] border-black/[0.06]" />
      <div className="relative flex items-center justify-between pt-2">
        <BackButton href="/shop" label={t("Назад")} />
        <a href={`tel:${supplier.phone}`} aria-label={t("Позвонить")} className="grid size-12 place-items-center rounded-full bg-night text-lime">
          <Phone className="size-5" strokeWidth={2.2} aria-hidden />
        </a>
      </div>
      <div className="relative mt-5">
        {subtitle && <p className="truncate text-sm font-semibold opacity-80">{subtitle}</p>}
        <h1 className="mt-1 font-display text-[2rem] leading-[1.05] font-bold tracking-tight">{supplier.displayName}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip dark className="tabular-nums">{terms.minOrderTotal ? t("Мин. {sum}", { sum: t.money(terms.minOrderTotal) }) : t("Без минимума")}</Chip>
          <Chip>
            {days.length === 0 || days.length === 7 ? t("Каждый день") : days.map((d) => t(WEEKDAY_SHORT[d - 1])).join(", ")}
            {terms.cutoffHour !== null && ` · ${t("заказ до {h}:00", { h: terms.cutoffHour })}`}
          </Chip>
          {account?.creditAllowed && <Chip>{account.creditLimit ? t("В долг до {sum}", { sum: t.money(account.creditLimit) }) : t("Можно в долг")}</Chip>}
        </div>
      </div>
    </section>
  );
}

// Нижняя плашка на странице поставщика: сколько в корзине, сумма, путь до минимальной суммы и «В корзину»
export async function CartSummaryBar({ supplierId, shopId, shopTerritoryId }: { supplierId: string; shopId: string; shopTerritoryId: string }) {
  const t = await getT();
  const [cart, terms] = await Promise.all([
    db.order.findFirst({ where: { shopId, supplierId, status: "DRAFT" }, select: { total: true, _count: { select: { items: true } } } }),
    supplierTermsForShop(db, supplierId, shopTerritoryId),
  ]);
  const items = cart?._count.items ?? 0;
  const total = Number(cart?.total ?? 0);
  const min = terms.minOrderTotal ?? 0;
  const short = Math.max(0, min - total);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1000] bg-linear-to-t from-page from-40% to-transparent px-3 pt-6 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto mx-auto max-w-xl rounded-[1.75rem] bg-night p-4 text-white shadow-[0_14px_34px_-10px_rgb(0_0_0/0.45)]">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="truncate text-sm text-white/60">{t("{n} товаров в корзине", { n: items })}</div>
            <Money key={total} text={t.money(total)} className="count-pop block font-display text-2xl font-bold tracking-tight tabular-nums" cur="text-white/50" />
          </div>
          <Link href={`/shop/cart/${supplierId}`} className="flex h-14 shrink-0 items-center gap-2 rounded-[1.25rem] bg-lime px-5 text-base font-bold text-night">
            {t("В корзину")}
            <ArrowRight className="size-5" strokeWidth={2.4} aria-hidden />
          </Link>
        </div>
        {min > 0 && (
          <>
            <Progress value={total / min} tone={short > 0 ? "coral" : "lime"} className="mt-3" />
            <div className="mt-2 text-sm text-white/80">
              {short > 0 ? t("До минимальной суммы осталось {sum}", { sum: t.money(short) }) : t("Минимальная сумма набрана")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Bell, Search } from "lucide-react";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { creditLeft } from "@/lib/finance-core";
import { orderStatusFilter, WEEKDAY_SHORT } from "@/lib/order-core";
import { supplierTermsForShop } from "@/lib/supplier-terms";
import { fileUrl } from "@/lib/storage-url";
import { cn } from "@/components/ui";
import { Avatar, CategoryIcon, initials, tileByIndex } from "./ui";

type Shop = { id: string; name: string; territoryId: string };

// Большая тёмная шапка главной (телефон): магазин и район, язык, уведомления, вопрос дня, поиск и карточка денег
export async function HomeHero({ shop, userId, q }: { shop: Shop; userId: string; q: string }) {
  const t = await getT();
  const [territory, unread, accounts, active] = await Promise.all([
    db.territory.findUnique({ where: { id: shop.territoryId }, select: { name: true } }),
    db.notification.count({ where: { userId, readAt: null } }),
    db.shopAccount.findMany({ where: { shopId: shop.id }, select: { balance: true, creditAllowed: true, creditLimit: true } }),
    db.order.count({ where: { shopId: shop.id, status: orderStatusFilter("active") } }),
  ]);
  // Остаток лимита в долг по всем поставщикам с лимитом; без лимитов — общий долг; без долга — заказы в работе
  const limited = accounts.filter((a) => a.creditAllowed && a.creditLimit !== null);
  const left = limited.reduce((s, a) => s + (creditLeft({ creditAllowed: true, creditLimit: Number(a.creditLimit), overdue: false }, Number(a.balance)) ?? 0), 0);
  const debt = accounts.reduce((s, a) => s + Math.max(0, Number(a.balance)), 0);
  const money =
    limited.length > 0
      ? { label: t("Осталось по лимиту в долг"), value: t.money(left), href: "/shop/debts" }
      : debt > 0
        ? { label: t("Ваш долг поставщикам"), value: t.money(debt), href: "/shop/debts" }
        : active > 0
          ? { label: t("Заказы в работе"), value: String(active), href: "/shop/orders" }
          : null;
  // «Что сегодня *закажем*?» — слово между звёздочками выделено
  const [before, word, after] = t("Что сегодня *закажем*?").split("*");

  return (
    <section className="-mx-4 -mt-[max(1.25rem,env(safe-area-inset-top))] rounded-b-[2rem] bg-night px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-5 text-white md:hidden">
      <div className="flex items-center gap-3 pt-2">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-lime font-display text-xl font-bold text-night" aria-hidden>
          {initials(shop.name).slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[17px] font-bold">{shop.name}</div>
          {territory && <div className="truncate text-sm text-white/60">{territory.name}</div>}
        </div>
        <LanguageSwitcher onNight />
        <Link href="/notifications" aria-label={t("Уведомления")} className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-night-2">
          <Bell className="size-5" aria-hidden />
          {unread > 0 && <span key={unread} className="badge-pop absolute top-2.5 right-3 size-2.5 rounded-full bg-coral ring-2 ring-night-2" />}
        </Link>
      </div>
      <h1 className="mt-6 font-display text-[1.9rem] leading-[1.1] font-bold tracking-tight">
        {before}
        <span className="text-lime">{word}</span>
        {after}
      </h1>
      <form action="/shop" role="search" className="mt-5 flex items-center gap-2 rounded-[1.25rem] bg-night-2 p-1.5 pl-5">
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("Товар или поставщик")}
          aria-label={t("Поиск товаров")}
          className="min-w-0 flex-1 bg-transparent py-2 text-base text-white placeholder:text-white/40 focus:outline-none"
        />
        <button className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lime text-night" aria-label={t("Найти")}>
          <Search className="size-5" strokeWidth={2.4} aria-hidden />
        </button>
      </form>
      {money && (
        <Link href={money.href} className="mt-3 flex items-center gap-3 rounded-[1.25rem] bg-lime px-5 py-3.5 text-night">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{money.label}</span>
            <span className="block font-display text-2xl font-bold tracking-tight tabular-nums">{money.value}</span>
          </span>
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-night text-lime">
            <ArrowUpRight className="size-5" strokeWidth={2.4} aria-hidden />
          </span>
        </Link>
      )}
    </section>
  );
}

// Плитки категорий: первая — высокая, остальные — сеткой 2×2, у каждой свой пастельный цвет
export async function CategoryTiles({ categories, hrefFor }: { categories: string[]; hrefFor: (name: string) => string }) {
  const t = await getT();
  if (categories.length === 0) return null;
  const [first, ...rest] = categories.slice(0, 5);
  return (
    <section>
      <h2 className="mb-3 font-display text-xl font-bold">{t("Категории")}</h2>
      <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2.5">
        <Link href={hrefFor(first)} className={cn("row-span-2 flex min-h-56 flex-col justify-between rounded-[1.5rem] p-4 text-night", tileByIndex(0))}>
          <CategoryIcon name={first} className="size-9" />
          <span className="font-display text-base leading-tight font-bold break-words">{first}</span>
        </Link>
        {rest.map((name, i) => (
          <Link key={name} href={hrefFor(name)} className={cn("flex min-h-[6.75rem] flex-col justify-between rounded-[1.5rem] p-3.5 text-night", tileByIndex(i + 2))}>
            <CategoryIcon name={name} className="size-6" />
            <span className="line-clamp-2 text-sm leading-tight font-bold">{name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

type SupplierRow = { id: string; displayName: string; logoPath: string | null };

// «Вам доставляют»: карточки поставщиков района с днями доставки и минимальной суммой
export async function SupplierStrip({ suppliers, shopTerritoryId }: { suppliers: SupplierRow[]; shopTerritoryId: string }) {
  const t = await getT();
  if (suppliers.length === 0) return null;
  const shown = suppliers.slice(0, 8);
  const terms = await Promise.all(shown.map((s) => supplierTermsForShop(db, s.id, shopTerritoryId)));
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold">{t("Вам доставляют")}</h2>
        <Link href="/shop/suppliers" className="text-sm font-bold underline underline-offset-4">{t("Все")}</Link>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {shown.map((s, i) => {
          const days = terms[i].weekdays;
          return (
            <Link key={s.id} href={`/shop/suppliers/${s.id}`} className="flex w-[17rem] shrink-0 snap-start flex-col gap-4 rounded-[1.5rem] bg-surface p-4">
              <span className="flex items-center gap-3">
                <Avatar name={s.displayName} src={fileUrl(s.logoPath)} className="size-14 text-lg" />
                <span className="min-w-0">
                  <span className="block truncate font-display text-lg leading-tight font-bold">{s.displayName}</span>
                  <span className="block truncate text-sm text-gray-500">
                    {days.length === 0 || days.length === 7 ? t("доставка каждый день") : days.map((d) => t(WEEKDAY_SHORT[d - 1])).join(", ")}
                  </span>
                </span>
              </span>
              <span className="mt-auto flex items-center justify-between gap-2">
                <span className="rounded-full bg-page px-3.5 py-2 text-sm font-semibold tabular-nums">
                  {terms[i].minOrderTotal ? t("Мин. {sum}", { sum: t.money(terms[i].minOrderTotal) }) : t("Без минимума")}
                </span>
                <span className="grid size-11 place-items-center rounded-full bg-night text-lime">
                  <ArrowRight className="size-5" strokeWidth={2.4} aria-hidden />
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

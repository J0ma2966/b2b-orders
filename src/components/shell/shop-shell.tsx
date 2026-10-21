import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Spinner } from "@/components/ui";
import { Tr } from "@/components/ui/tr";
import { db } from "@/lib/db";
import { getShopContext } from "@/lib/auth/current";
import { logoutAction } from "@/app/(auth)/actions";
import { getT } from "@/lib/i18n/server";
import { LanguageSwitcher } from "./language-switcher";
import { BottomNav, BottomNavView, TabNav, TabNavView, type NavItem } from "./nav-links";
import { ImpersonationBanner } from "./user-menu";
import { navForRole } from "./shop-nav";

// Витрина магазина: цветная шапка с поиском по всем поставщикам и корзиной, вкладки сверху,
// на телефоне — нижнее меню как в приложении. Данные магазина подгружаются потоком.
export function ShopShell({ nav, mobileNav, children }: { nav: NavItem[]; mobileNav: NavItem[]; children: ReactNode }) {
  return (
    <div data-theme="shop" className="flex min-h-full flex-1 flex-col bg-page font-sans text-ink">
      <Suspense>
        <ImpersonationBanner />
      </Suspense>
      <header className="sticky top-0 z-[1001] bg-brand-700 text-white shadow-[0_1px_0_rgb(0_0_0/0.08)]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-3 pb-2 md:pb-1">
          <Link href="/shop" className="flex min-w-0 items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-lg text-on-accent" aria-hidden>
              🛍
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[15px] leading-tight font-semibold"><Tr>Магазин</Tr></span>
              <Suspense fallback={<span className="block h-4" />}>
                <ShopName />
              </Suspense>
            </span>
          </Link>
          <Suspense>
            <SearchForm className="mx-4 hidden flex-1 md:flex" />
          </Suspense>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Suspense fallback={<div className="h-9" />}>
              <ShopActions />
            </Suspense>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3 md:hidden">
          <Suspense>
            <SearchForm className="flex" />
          </Suspense>
        </div>
        <div className="mx-auto hidden max-w-6xl px-2 md:block">
          <Suspense fallback={<TabNavView items={nav} root="/shop" />}>
            <ShopTabNav items={nav} />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-24 md:pb-10">
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </main>
      <Suspense fallback={<BottomNavView items={mobileNav} root="/shop" />}>
        <ShopBottomNav items={mobileNav} />
      </Suspense>
    </div>
  );
}

async function ShopName() {
  const ctx = await getShopContext();
  if (!ctx) return null;
  return <span className="block max-w-[11rem] truncate text-xs text-white/75 sm:max-w-xs">{ctx.shop.name}</span>;
}

async function SearchForm({ className }: { className?: string }) {
  const t = await getT();
  return (
    <form action="/shop/search" role="search" className={className}>
      <input
        name="q"
        type="search"
        placeholder={t("Найти товар у всех поставщиков")}
        aria-label={t("Поиск товаров")}
        className="w-full rounded-full border-0 bg-white px-4 py-2.5 text-base text-ink placeholder:text-gray-500 focus:ring-2 focus:ring-accent focus:outline-none sm:text-sm"
      />
    </form>
  );
}

async function cartSummary(shopId: string) {
  const [items, sum] = await Promise.all([
    db.orderItem.count({ where: { order: { shopId, status: "DRAFT" } } }),
    db.order.aggregate({ where: { shopId, status: "DRAFT" }, _sum: { total: true } }),
  ]);
  return { items, total: Number(sum._sum.total ?? 0) };
}

async function ShopActions() {
  const [ctx, t] = await Promise.all([getShopContext(), getT()]);
  if (!ctx) return <LanguageSwitcher onDark />;
  const [unread, cart] = await Promise.all([
    db.notification.count({ where: { userId: ctx.auth.user.id, readAt: null } }),
    cartSummary(ctx.shop.id),
  ]);
  return (
    <>
      <LanguageSwitcher onDark />
      <Link href="/notifications" className="relative grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label={t("Уведомления")}>
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-medium text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      <Link
        href="/shop/cart"
        className="hidden items-center gap-2 rounded-full bg-accent py-1.5 pr-3.5 pl-2.5 text-sm font-semibold text-on-accent md:flex"
        aria-label={t("Корзина")}
      >
        <span aria-hidden>🛒</span>
        {cart.items > 0 ? (
          <span className="tabular-nums">
            {cart.items} · {t.money(cart.total)}
          </span>
        ) : (
          t("Корзина")
        )}
      </Link>
      <form action={logoutAction} className="hidden md:block">
        <button className="rounded-full px-2 py-1.5 text-sm text-white/75 hover:text-white">{t("Выйти")}</button>
      </form>
    </>
  );
}

async function ShopTabNav({ items }: { items: NavItem[] }) {
  const ctx = await getShopContext();
  return <TabNav items={navForRole(items, ctx?.membership.role)} root="/shop" />;
}

async function ShopBottomNav({ items }: { items: NavItem[] }) {
  const ctx = await getShopContext();
  const cart = ctx ? await cartSummary(ctx.shop.id) : null;
  return <BottomNav items={navForRole(items, ctx?.membership.role)} root="/shop" badges={cart ? { "/shop/cart": cart.items } : undefined} />;
}

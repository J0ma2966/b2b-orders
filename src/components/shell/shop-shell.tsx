import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Bell, Search, ShoppingBag, ShoppingCart } from "lucide-react";
import { cn, Spinner } from "@/components/ui";
import { Tr } from "@/components/ui/tr";
import { db } from "@/lib/db";
import { liveStamp } from "@/lib/live";
import { LiveRefresh } from "./live-refresh";
import { getShopContext } from "@/lib/auth/current";
import { logoutAction } from "@/app/(auth)/actions";
import { getT } from "@/lib/i18n/server";
import { LanguageSwitcher } from "./language-switcher";
import { BottomNav, BottomNavView, TabNav, TabNavView, type NavItem } from "./nav-links";
import { ImpersonationBanner } from "./user-menu";
import { NavPendingOverlay, NavProgressBar } from "./nav-progress";
import { navForRole, SHOP_NAV_HIDE_ON } from "./shop-nav";
import { shopBadges } from "@/lib/nav-badges";

// Витрина магазина: цветная шапка с поиском по всем поставщикам и корзиной, вкладки сверху,
// на телефоне — нижнее меню как в приложении. Данные магазина подгружаются потоком.
export function ShopShell({ nav, mobileNav, children }: { nav: NavItem[]; mobileNav: NavItem[]; children: ReactNode }) {
  return (
    <div data-theme="shop" className="flex min-h-full flex-1 flex-col bg-page font-sans text-ink">
      <NavProgressBar />
      <Suspense>
        <ImpersonationBanner />
      </Suspense>
      {/* На телефоне шапки нет: у главной своя большая тёмная шапка, у остальных экранов — заголовок или кнопка «Назад» */}
      <header className="sticky top-0 z-[1001] hidden bg-night text-white md:block" style={{ viewTransitionName: "app-header" }}>
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-3 pb-2 md:pb-1">
          <Link href="/shop" className="flex min-w-0 items-center gap-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]" aria-hidden>
              <ShoppingBag className="size-5" strokeWidth={2.2} />
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
        <div className="mx-auto hidden max-w-6xl px-2 md:block">
          <Suspense fallback={<TabNavView items={nav} root="/shop" />}>
            <ShopTabNav items={nav} mobileNav={mobileNav} />
          </Suspense>
        </div>
      </header>
      <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-32 md:pt-5 md:pb-10">
        <Suspense fallback={<Spinner />}>{children}</Suspense>
        <NavPendingOverlay />
      </main>
      <Suspense fallback={<BottomNavView items={mobileNav} root="/shop" tone="dark" hideOn={SHOP_NAV_HIDE_ON} />}>
        <ShopBottomNav items={mobileNav} nav={nav} />
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
    <form action="/shop" role="search" className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        name="q"
        type="search"
        placeholder={t("Найти товар у всех поставщиков")}
        aria-label={t("Поиск товаров")}
        className="w-full rounded-2xl border-0 bg-white py-3 pr-4 pl-10 text-base text-ink shadow-[0_2px_8px_rgb(0_0_0/0.12)] placeholder:text-gray-500 focus:ring-2 focus:ring-accent focus:outline-none sm:text-sm"
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
  const [unread, cart, stamp] = await Promise.all([
    db.notification.count({ where: { userId: ctx.auth.user.id, readAt: null } }),
    cartSummary(ctx.shop.id),
    liveStamp(ctx.auth.user.id),
  ]);
  return (
    <>
      <LanguageSwitcher onDark />
      <LiveRefresh stamp={stamp} />
      <Link href="/notifications" className="relative grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label={t("Уведомления")}>
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span key={unread} className="badge-pop absolute -top-1 -right-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] leading-5 font-semibold text-white ring-2 ring-night">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      <Link
        href="/shop/cart"
        className="hidden items-center gap-2 rounded-full bg-accent py-1.5 pr-3.5 pl-2.5 text-sm font-semibold text-on-accent md:flex"
        aria-label={t("Корзина")}
      >
        <ShoppingCart className="size-[18px]" aria-hidden />
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

// Счётчики разделов: корзина — позиции, остальное — непрочитанные уведомления раздела
async function loadShopBadges(nav: NavItem[], mobileNav: NavItem[]) {
  const ctx = await getShopContext();
  if (!ctx) return { ctx, badges: null };
  const items = navForRole(nav, ctx.membership.role);
  const badges = await shopBadges(ctx.auth.user.id, ctx.shop.id, items.map((i) => i.href), mobileNav.map((i) => i.href));
  return { ctx, badges };
}

async function ShopTabNav({ items, mobileNav }: { items: NavItem[]; mobileNav: NavItem[] }) {
  const { ctx, badges } = await loadShopBadges(items, mobileNav);
  return <TabNav items={navForRole(items, ctx?.membership.role)} root="/shop" badges={badges?.side} />;
}

async function ShopBottomNav({ items, nav }: { items: NavItem[]; nav: NavItem[] }) {
  const { ctx, badges } = await loadShopBadges(nav, items);
  return <BottomNav items={navForRole(items, ctx?.membership.role)} root="/shop" tone="dark" hideOn={SHOP_NAV_HIDE_ON} badges={badges?.bottom} />;
}

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Spinner } from "@/components/ui";
import { Tr } from "@/components/ui/tr";
import { db } from "@/lib/db";
import { liveStamp } from "@/lib/live";
import { LiveRefresh } from "./live-refresh";
import { getAuth, getSupplierContext } from "@/lib/auth/current";
import { logoutAction } from "@/app/(auth)/actions";
import { getT } from "@/lib/i18n/server";
import { LanguageSwitcher } from "./language-switcher";
import { BottomNav, BottomNavView, type NavItem } from "./nav-links";
import { ImpersonationBanner } from "./user-menu";
import { OfflineSync } from "@/components/orders/offline-sync";

export const COURIER_NAV: NavItem[] = [
  { href: "/courier", label: "Доставки", icon: "🚚", also: ["/courier/orders/"] },
  { href: "/courier/replacements", label: "Замены", icon: "🔁" },
  { href: "/courier/map", label: "Карта", icon: "🗺️" },
  { href: "/courier/history", label: "История", icon: "🕘" },
  { href: "/account", label: "Профиль", icon: "👤" },
];

// Приложение доставщика: тёмная контрастная тема для улицы, одна колонка под телефон
// и нижняя панель разделов на любом экране.
export function CourierShell({ children }: { children: ReactNode }) {
  return (
    <div data-theme="courier" className="flex min-h-full flex-1 flex-col bg-page font-sans text-ink">
      <Suspense>
        <ImpersonationBanner />
      </Suspense>
      <header className="sticky top-0 z-[1001] border-b border-gray-200 bg-page/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between gap-3 px-4">
          <Link href="/courier" className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-lg text-on-brand" aria-hidden>
              🚚
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-[15px] font-bold"><Tr>Доставщик</Tr></span>
              <Suspense fallback={<span className="block h-4" />}>
                <SupplierName />
              </Suspense>
            </span>
          </Link>
          <Suspense fallback={<div className="h-9" />}>
            <CourierActions />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-4 pb-28">
        <Suspense>
          <CourierOfflineSync />
        </Suspense>
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </main>
      <Suspense fallback={<BottomNavView items={COURIER_NAV} root="/courier" app />}>
        <BottomNav items={COURIER_NAV} root="/courier" app />
      </Suspense>
    </div>
  );
}

async function SupplierName() {
  const ctx = await getSupplierContext();
  if (!ctx) return null;
  return <span className="block max-w-[12rem] truncate text-xs text-gray-500">{ctx.supplier.displayName}</span>;
}

async function CourierActions() {
  const [auth, t, ctx] = await Promise.all([getAuth(), getT(), getSupplierContext()]);
  if (!auth) return <LanguageSwitcher />;
  const [unread, stamp] = await Promise.all([db.notification.count({ where: { userId: auth.user.id, readAt: null } }), liveStamp(auth.user.id)]);
  // Поставщик, который развозит сам, возвращается отсюда в свой кабинет
  const staff = ctx && ctx.membership.role !== "COURIER";
  return (
    <div className="flex items-center gap-1.5">
      {staff && (
        <Link href="/supplier/delivery" className="grid size-10 place-items-center rounded-full hover:bg-gray-100" aria-label={t("Кабинет поставщика")} title={t("Кабинет поставщика")}>
          <span aria-hidden>🏢</span>
        </Link>
      )}
      <LanguageSwitcher />
      <LiveRefresh stamp={stamp} />
      <Link href="/notifications" className="relative grid size-10 place-items-center rounded-full hover:bg-gray-100" aria-label={t("Уведомления")}>
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute top-0 right-0 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>
        )}
      </Link>
      <form action={logoutAction}>
        <button className="grid size-10 place-items-center rounded-full text-gray-500 hover:bg-gray-100" aria-label={t("Выйти")} title={t("Выйти")}>
          <span aria-hidden>⏻</span>
        </button>
      </form>
    </div>
  );
}

async function CourierOfflineSync() {
  const auth = await getAuth();
  if (!auth) return null;
  return <OfflineSync userId={auth.user.id} />;
}

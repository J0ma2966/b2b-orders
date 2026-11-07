"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { Icon } from "@/components/ui/icon";
import { tapHaptic } from "@/lib/native";

export type NavItem = { href: string; label: string; icon?: string; also?: string[] };
export type NavBadges = Record<string, number>;

function isActive(pathname: string, href: string, root: string, also: string[] = []) {
  if (also.some((p) => pathname.startsWith(p))) return true;
  return href === root ? pathname === root : pathname === href || pathname.startsWith(href + "/");
}

export function SideNav({ items, root }: { items: NavItem[]; root: string }) {
  return <SideNavView items={items} root={root} pathname={usePathname()} />;
}

// Без подсветки — пока путь не известен (пререндер динамических маршрутов)
export function SideNavView({ items, root, pathname = "" }: { items: NavItem[]; root: string; pathname?: string }) {
  const t = useT();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap",
            isActive(pathname, item.href, root) ? "bg-brand-50 font-medium text-brand-700" : "text-gray-700 hover:bg-gray-100",
          )}
        >
          <Icon emoji={item.icon} className="size-[18px] opacity-80" />
          {t(item.label)}
        </Link>
      ))}
    </nav>
  );
}

// Вкладки витрины магазина под цветной шапкой (компьютер и планшет)
export function TabNav({ items, root }: { items: NavItem[]; root: string }) {
  return <TabNavView items={items} root={root} pathname={usePathname()} />;
}

export function TabNavView({ items, root, pathname = "" }: { items: NavItem[]; root: string; pathname?: string }) {
  const t = useT();
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const active = isActive(pathname, item.href, root);
        return (
          <Link
            key={item.href}
            href={item.href}
            transitionTypes={["tab"]}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-[3px] px-3 pt-2 pb-2.5 text-sm whitespace-nowrap",
              active ? "border-accent font-semibold text-white" : "border-transparent text-white/75 hover:text-white",
            )}
          >
            {t(item.label)}
          </Link>
        );
      })}
    </nav>
  );
}

// Нижняя панель для телефонов (магазин, доставщик, поставщик): «плавающая» матовая панель,
// плашка активного раздела переезжает под нажатую вкладку. Переход по вкладке помечен типом «tab» —
// страница сменяется мягким наплывом, а не сдвигом (см. globals.css, «Переходы между страницами»).
// app — приложение доставщика: панель видна и на компьютере, активный раздел — жёлтая плашка
export function BottomNav({ items, root, badges, app }: { items: NavItem[]; root: string; badges?: NavBadges; app?: boolean }) {
  return <BottomNavView items={items} root={root} badges={badges} app={app} pathname={usePathname()} />;
}

export function BottomNavView({
  items,
  root,
  badges,
  app,
  pathname = "",
}: {
  items: NavItem[];
  root: string;
  badges?: NavBadges;
  app?: boolean;
  pathname?: string;
}) {
  const t = useT();
  const active = items.findIndex((item) => isActive(pathname, item.href, root, item.also));
  return (
    <nav
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-[1000] bg-linear-to-t from-page from-30% to-transparent px-3 pt-6 pb-[max(0.625rem,env(safe-area-inset-bottom))]",
        !app && "md:hidden",
      )}
    >
      {/* Имя для перехода — на самой панели, а не на nav: иначе nav отрезал бы ей размытие фона */}
      <div
        className="pointer-events-auto relative mx-auto grid max-w-xl rounded-[1.375rem] bg-surface/80 p-1.5 shadow-[0_10px_30px_-6px_rgb(0_0_0/0.22),0_2px_6px_rgb(0_0_0/0.06)] ring-1 ring-gray-200/80 backdrop-blur-xl backdrop-saturate-150"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, viewTransitionName: "bottom-nav" }}
      >
        <span
          aria-hidden
          className={cn("nav-indicator absolute inset-y-1.5 left-1.5 rounded-2xl", app ? "bg-brand-600" : "bg-brand-50", active < 0 && "opacity-0")}
          style={{ width: `calc((100% - 0.75rem) / ${items.length})`, transform: `translateX(${Math.max(active, 0) * 100}%)` }}
        />
        {items.map((item, i) => {
          const on = i === active;
          const badge = badges?.[item.href] ?? 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              transitionTypes={["tab"]}
              onClick={() => !on && tapHaptic()}
              aria-current={on ? "page" : undefined}
              className={cn(
                "tab-item relative z-10 flex min-w-0 flex-col items-center gap-1 rounded-2xl pt-2 pb-1.5 text-[11px] leading-none",
                on ? (app ? "font-semibold text-on-brand" : "font-semibold text-brand-700") : "text-gray-500",
              )}
            >
              <span className="tab-icon relative" data-on={on || undefined}>
                <Icon emoji={item.icon} className="size-[22px]" strokeWidth={on ? 2.3 : 1.8} />
                {badge > 0 && (
                  <span key={badge} className="badge-pop absolute -top-1.5 -right-2.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] leading-[18px] font-bold text-on-accent ring-2 ring-surface">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate px-0.5">{t(item.label)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

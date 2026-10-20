"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

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
          {item.icon && <span aria-hidden>{item.icon}</span>}
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

// Нижняя панель для телефонов (магазин, доставщик)
// app — приложение доставщика: панель видна и на компьютере, активный раздел выделен плашкой
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
  return (
    <nav className={cn("fixed inset-x-0 bottom-0 z-[1000] border-t border-gray-200 bg-surface pb-[env(safe-area-inset-bottom)]", !app && "md:hidden")}>
      <div className={cn("grid", app && "mx-auto max-w-xl")} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => {
        const active = isActive(pathname, item.href, root, item.also);
        const badge = badges?.[item.href] ?? 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-0.5",
              app ? "py-2.5 text-xs" : "py-2 text-[11px]",
              active ? (app ? "font-semibold text-ink" : "font-semibold text-brand-700") : "text-gray-500",
            )}
          >
            <span className={cn("relative leading-none", app ? "rounded-full px-4 py-1 text-xl" : "text-lg", app && active && "bg-brand-600")} aria-hidden>
              {item.icon}
              {badge > 0 && (
                <span className="absolute -top-1.5 -right-3 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-bold text-on-accent">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </span>
            {t(item.label)}
          </Link>
        );
      })}
      </div>
    </nav>
  );
}

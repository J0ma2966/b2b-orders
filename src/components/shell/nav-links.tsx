"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

export type NavItem = { href: string; label: string; icon?: string };

function isActive(pathname: string, href: string, root: string) {
  return href === root ? pathname === root : pathname === href || pathname.startsWith(href + "/");
}

export function SideNav({ items, root }: { items: NavItem[]; root: string }) {
  return <SideNavView items={items} root={root} pathname={usePathname()} />;
}

// Без подсветки — пока путь не известен (пререндер динамических маршрутов)
export function SideNavView({ items, root, pathname = "" }: { items: NavItem[]; root: string; pathname?: string }) {
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
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

// Нижняя панель для телефонов (магазин, доставщик)
export function BottomNav({ items, root }: { items: NavItem[]; root: string }) {
  return <BottomNavView items={items} root={root} pathname={usePathname()} />;
}

export function BottomNavView({ items, root, pathname = "" }: { items: NavItem[]; root: string; pathname?: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[1000] grid border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex flex-col items-center gap-0.5 py-2 text-[11px]",
            isActive(pathname, item.href, root) ? "text-brand-700" : "text-gray-500",
          )}
        >
          <span className="text-lg leading-none" aria-hidden>{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { SideNav } from "@/components/shell/nav-links";
import { getAuth } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { unreadBySection } from "@/lib/nav-badges";
import { mergeMax } from "@/lib/nav-badges-core";

export const ADMIN_NAV = [
  { href: "/admin", label: "Обзор", icon: "📊" },
  { href: "/admin/suppliers", label: "Поставщики", icon: "🏭" },
  { href: "/admin/shops", label: "Магазины", icon: "🏪" },
  { href: "/admin/orders", label: "Заказы", icon: "📋" },
  { href: "/admin/products", label: "Товары", icon: "📦" },
  { href: "/admin/stock", label: "Остатки", icon: "🏬" },
  { href: "/admin/bonuses", label: "Бонусы", icon: "🎁" },
  { href: "/admin/replacements", label: "Замены", icon: "🔁" },
  { href: "/admin/deliveries", label: "Доставки", icon: "🚚" },
  { href: "/admin/finance", label: "Финансы", icon: "💰" },
  { href: "/admin/commissions", label: "Комиссии", icon: "％" },
  { href: "/admin/antifraud", label: "Антифрод", icon: "🚨" },
  { href: "/admin/reports", label: "Отчёты", icon: "📈" },
  { href: "/admin/map", label: "Карта", icon: "🗺️" },
  { href: "/admin/territories", label: "Территории", icon: "📍" },
  { href: "/admin/support", label: "Поддержка", icon: "✉️" },
  { href: "/notifications", label: "Уведомления", icon: "🔔" },
  { href: "/admin/audit", label: "Аудит", icon: "📜" },
  { href: "/admin/settings", label: "Настройки", icon: "⚙️" },
];

// Счётчики: непрочитанные уведомления по разделам, у «Уведомлений» — все непрочитанные
async function AdminSideNav() {
  const auth = await getAuth();
  if (!auth) return <SideNav items={ADMIN_NAV} root="/admin" />;
  const [badges, unread, support] = await Promise.all([
    unreadBySection(auth.user.id, ADMIN_NAV.map((i) => i.href)),
    db.notification.count({ where: { userId: auth.user.id, readAt: null } }),
    db.supportEmail.count({ where: { handledAt: null } }),
  ]);
  // «Поддержка» — как почтовый ящик: число необработанных писем
  return <SideNav items={ADMIN_NAV} root="/admin" badges={mergeMax(badges, { "/notifications": unread, "/admin/support": support })} />;
}

// Кабинет суперадмина. Используется и в /admin, и на общих страницах (уведомления, профиль),
// чтобы админ не попадал в отдельное оформление «Мой профиль»
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AppShell title="Админ платформы" root="/admin" nav={ADMIN_NAV} side={<AdminSideNav />}>
      {children}
    </AppShell>
  );
}

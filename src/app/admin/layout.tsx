import { AppShell } from "@/components/shell/app-shell";
import { SideNav } from "@/components/shell/nav-links";
import { getAuth } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { unreadBySection } from "@/lib/nav-badges";

const NAV = [
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
  { href: "/notifications", label: "Уведомления", icon: "🔔" },
  { href: "/admin/audit", label: "Аудит", icon: "📜" },
  { href: "/admin/settings", label: "Настройки", icon: "⚙️" },
];

// Счётчики: непрочитанные уведомления по разделам, у «Уведомлений» — все непрочитанные
async function AdminSideNav() {
  const auth = await getAuth();
  if (!auth) return <SideNav items={NAV} root="/admin" />;
  const [badges, unread] = await Promise.all([
    unreadBySection(auth.user.id, NAV.map((i) => i.href)),
    db.notification.count({ where: { userId: auth.user.id, readAt: null } }),
  ]);
  return <SideNav items={NAV} root="/admin" badges={{ ...badges, "/notifications": unread }} />;
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell title="Админ платформы" root="/admin" nav={NAV} side={<AdminSideNav />}>
      {children}
    </AppShell>
  );
}

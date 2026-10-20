import { AppShell } from "@/components/shell/app-shell";

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

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell title="Админ платформы" root="/admin" nav={NAV}>
      {children}
    </AppShell>
  );
}

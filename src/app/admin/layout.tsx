import { AppShell } from "@/components/shell/app-shell";

const NAV = [
  { href: "/admin", label: "Обзор", icon: "📊" },
  { href: "/admin/suppliers", label: "Поставщики", icon: "🏭" },
  { href: "/admin/shops", label: "Магазины", icon: "🏪" },
  { href: "/admin/orders", label: "Заказы", icon: "📋" },
  { href: "/admin/antifraud", label: "Антифрод", icon: "🚨" },
  { href: "/admin/territories", label: "Территории", icon: "🗺️" },
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

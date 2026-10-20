import { AppShell } from "@/components/shell/app-shell";
import { SupplierSwitcher } from "./switcher";

const NAV = [
  { href: "/supplier", label: "Обзор", icon: "📊" },
  { href: "/supplier/catalog", label: "Каталог", icon: "📦" },
  { href: "/supplier/stock", label: "Остатки", icon: "🏬" },
  { href: "/supplier/profile", label: "Профиль", icon: "🏢" },
  { href: "/supplier/territory", label: "Территория доставки", icon: "🗺️" },
  { href: "/supplier/team", label: "Сотрудники и доставщики", icon: "👥" },
];

export default function SupplierLayout({ children }: LayoutProps<"/supplier">) {
  return (
    <AppShell title="Кабинет поставщика" root="/supplier" nav={NAV} context={<SupplierSwitcher />}>
      {children}
    </AppShell>
  );
}

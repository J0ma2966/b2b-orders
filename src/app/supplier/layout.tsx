import { AppShell } from "@/components/shell/app-shell";
import { SupplierSwitcher } from "./switcher";

const NAV = [
  { href: "/supplier", label: "Обзор", icon: "📊" },
  { href: "/supplier/orders", label: "Заказы", icon: "📋" },
  { href: "/supplier/catalog", label: "Каталог", icon: "📦" },
  { href: "/supplier/stock", label: "Остатки", icon: "🏬" },
  { href: "/supplier/bonuses", label: "Бонусы", icon: "🎁" },
  { href: "/supplier/shops", label: "Магазины и долги", icon: "🏪" },
  { href: "/supplier/cash", label: "Касса доставщиков", icon: "💵" },
  { href: "/supplier/replacements", label: "Замены", icon: "🔁" },
  { href: "/supplier/returned", label: "Возвращённые товары", icon: "↩️" },
  { href: "/supplier/reports", label: "Отчёты", icon: "📈" },
  { href: "/supplier/commission", label: "Комиссия платформы", icon: "🧮" },
  { href: "/supplier/map", label: "Карта", icon: "🗺️" },
  { href: "/supplier/profile", label: "Профиль", icon: "🏢" },
  { href: "/supplier/territory", label: "Территория доставки", icon: "🗺️" },
  { href: "/supplier/team", label: "Сотрудники и доставщики", icon: "👥" },
  { href: "/supplier/audit", label: "Журнал действий", icon: "🧾" },
];

export default function SupplierLayout({ children }: LayoutProps<"/supplier">) {
  return (
    <AppShell title="Кабинет поставщика" root="/supplier" nav={NAV} context={<SupplierSwitcher />}>
      {children}
    </AppShell>
  );
}

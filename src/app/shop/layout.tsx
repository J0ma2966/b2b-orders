import { AppShell } from "@/components/shell/app-shell";
import { ShopSwitcher } from "./switcher";

const NAV = [
  { href: "/shop", label: "Главная", icon: "🏠" },
  { href: "/shop/suppliers", label: "Поставщики", icon: "🏭" },
  { href: "/shop/points", label: "Мои точки", icon: "📍" },
  { href: "/shop/profile", label: "Профиль", icon: "👤" },
];

export default function ShopLayout({ children }: LayoutProps<"/shop">) {
  return (
    <AppShell title="Магазин" root="/shop" nav={NAV} mobileNav={NAV} context={<ShopSwitcher />}>
      {children}
    </AppShell>
  );
}

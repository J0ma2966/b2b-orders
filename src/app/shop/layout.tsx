import { AppShell } from "@/components/shell/app-shell";
import { ShopSwitcher } from "./switcher";

const NAV = [
  { href: "/shop", label: "Главная", icon: "🏠" },
  { href: "/shop/suppliers", label: "Поставщики", icon: "🏭" },
  { href: "/shop/cart", label: "Корзина", icon: "🛒" },
  { href: "/shop/orders", label: "Заказы", icon: "📋" },
  { href: "/shop/points", label: "Мои точки", icon: "📍" },
  { href: "/shop/profile", label: "Профиль", icon: "👤" },
];

// В нижнем меню телефона — пять главных разделов; точки доступны из профиля и переключателя
const MOBILE_NAV = NAV.filter((i) => i.href !== "/shop/points");

export default function ShopLayout({ children }: LayoutProps<"/shop">) {
  return (
    <AppShell title="Магазин" root="/shop" nav={NAV} mobileNav={MOBILE_NAV} context={<ShopSwitcher />}>
      {children}
    </AppShell>
  );
}

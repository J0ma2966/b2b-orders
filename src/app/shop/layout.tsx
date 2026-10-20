import { AppShell } from "@/components/shell/app-shell";
import { ShopSwitcher } from "./switcher";

const NAV = [
  { href: "/shop", label: "Главная", icon: "🏠" },
  { href: "/shop/suppliers", label: "Поставщики", icon: "🏭" },
  { href: "/shop/cart", label: "Корзина", icon: "🛒" },
  { href: "/shop/orders", label: "Заказы", icon: "📋" },
  { href: "/shop/replacements", label: "Замены", icon: "🔁" },
  { href: "/shop/debts", label: "Задолженность", icon: "💰" },
  { href: "/shop/documents", label: "Документы", icon: "🧾" },
  { href: "/shop/points", label: "Мои точки", icon: "📍" },
  { href: "/shop/profile", label: "Профиль", icon: "👤" },
];

// В нижнем меню телефона — пять главных разделов; точки доступны из профиля и переключателя
const MOBILE_NAV = NAV.filter((i) => ["/shop", "/shop/suppliers", "/shop/cart", "/shop/orders", "/shop/profile"].includes(i.href));

export default function ShopLayout({ children }: LayoutProps<"/shop">) {
  return (
    <AppShell title="Магазин" root="/shop" nav={NAV} mobileNav={MOBILE_NAV} context={<ShopSwitcher />}>
      {children}
    </AppShell>
  );
}

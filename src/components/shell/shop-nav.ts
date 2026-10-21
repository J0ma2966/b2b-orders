import type { NavItem } from "./nav-links";

export const SHOP_NAV: NavItem[] = [
  { href: "/shop", label: "Главная", icon: "🏠" },
  { href: "/shop/suppliers", label: "Поставщики", icon: "🏭" },
  { href: "/shop/cart", label: "Корзина", icon: "🛒" },
  { href: "/shop/orders", label: "Заказы", icon: "📦" },
  { href: "/shop/replacements", label: "Замены", icon: "🔁" },
  { href: "/shop/debts", label: "Задолженность", icon: "💰" },
  { href: "/shop/documents", label: "Документы", icon: "🧾" },
  { href: "/shop/points", label: "Мои точки", icon: "📍" },
  { href: "/shop/profile", label: "Профиль", icon: "👤" },
];

// В нижнем меню телефона — пять главных разделов; остальное собрано в профиле
export const SHOP_MOBILE_NAV = SHOP_NAV.filter((i) => ["/shop", "/shop/suppliers", "/shop/cart", "/shop/orders", "/shop/profile"].includes(i.href));

// М6: эти разделы видит только владелец магазина
export const SHOP_OWNER_ONLY = ["/shop/debts", "/shop/team"];
export const navForRole = (items: NavItem[], role: string | undefined) => (role === "STAFF" ? items.filter((i) => !SHOP_OWNER_ONLY.includes(i.href)) : items);

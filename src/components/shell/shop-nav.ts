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

// В нижнем меню телефона — пять главных разделов (как в макете: главная, корзина, заказы, долги, профиль);
// поставщики — на главной («Все»), остальное собрано в профиле
const SHORT: Record<string, string> = { "/shop/debts": "Долги" };
export const SHOP_MOBILE_NAV = ["/shop", "/shop/cart", "/shop/orders", "/shop/debts", "/shop/profile"].map((href) => {
  const item = SHOP_NAV.find((i) => i.href === href)!;
  return { ...item, label: SHORT[href] ?? item.label, also: href === "/shop" ? ["/shop/suppliers", "/shop/search"] : undefined };
});
// Страницы поставщика и товара: вместо нижнего меню — своя плашка с итогом корзины
export const SHOP_NAV_HIDE_ON = ["/shop/suppliers/"];

// М6: эти разделы видит только владелец магазина
export const SHOP_OWNER_ONLY = ["/shop/debts", "/shop/team"];
export const navForRole = (items: NavItem[], role: string | undefined) => (role === "STAFF" ? items.filter((i) => !SHOP_OWNER_ONLY.includes(i.href)) : items);

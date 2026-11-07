import type { NavItem } from "@/components/shell/nav-links";

export const SUPPLIER_NAV: NavItem[] = [
  { href: "/supplier", label: "Обзор", icon: "📊" },
  { href: "/supplier/orders", label: "Заказы", icon: "📋" },
  { href: "/supplier/catalog", label: "Каталог", icon: "📦" },
  { href: "/supplier/stock", label: "Остатки", icon: "🏬" },
  { href: "/supplier/bonuses", label: "Бонусы", icon: "🎁" },
  { href: "/supplier/shops", label: "Магазины и долги", icon: "🏪" },
  { href: "/supplier/delivery", label: "Доставка", icon: "🚚" },
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

// Телефон (приложение): четыре главных раздела внизу, остальное — в «Ещё».
// Магазины с долгами — внизу: деньги важнее всего; доставки — карточкой на главной и в «Ещё».
// Подписи короче, чтобы помещались и по-узбекски.
const MAIN = ["/supplier", "/supplier/orders", "/supplier/shops", "/supplier/stock"];
const SHORT: Record<string, string> = { "/supplier": "Главная", "/supplier/shops": "Магазины", "/supplier/stock": "Склад" };
export const SUPPLIER_MORE = "/supplier/more";
export const SUPPLIER_MOBILE_NAV: NavItem[] = [
  ...MAIN.map((href) => {
    const item = SUPPLIER_NAV.find((i) => i.href === href)!;
    return { ...item, label: SHORT[href] ?? item.label };
  }),
  {
    href: SUPPLIER_MORE,
    label: "Ещё",
    icon: "☰",
    // «Ещё» подсвечен в любом разделе, которого нет в нижней панели
    also: SUPPLIER_NAV.filter((i) => !MAIN.includes(i.href)).map((i) => i.href),
  },
];

// Разделы на экране «Ещё», по смыслу
export const SUPPLIER_MORE_GROUPS: { title: string; items: string[] }[] = [
  { title: "Товары", items: ["/supplier/catalog", "/supplier/bonuses", "/supplier/replacements", "/supplier/returned"] },
  { title: "Деньги", items: ["/supplier/cash", "/supplier/reports", "/supplier/commission"] },
  { title: "Компания", items: ["/supplier/delivery", "/supplier/profile", "/supplier/team", "/supplier/territory", "/supplier/map", "/supplier/audit"] },
];

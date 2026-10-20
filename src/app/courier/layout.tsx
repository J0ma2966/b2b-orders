import { AppShell } from "@/components/shell/app-shell";

const NAV = [
  { href: "/courier", label: "Доставки", icon: "🚚" },
  { href: "/courier/replacements", label: "Замены", icon: "🔁" },
  { href: "/courier/map", label: "Карта", icon: "🗺️" },
  { href: "/courier/history", label: "История", icon: "🕘" },
  { href: "/account", label: "Профиль", icon: "👤" },
];

export default function CourierLayout({ children }: LayoutProps<"/courier">) {
  return (
    <AppShell title="Доставщик" root="/courier" nav={NAV} mobileNav={NAV}>
      {children}
    </AppShell>
  );
}

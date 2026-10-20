import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { getAuth, homePathFor } from "@/lib/auth/current";

const NAV = [
  { href: "/account", label: "Профиль", icon: "👤" },
  { href: "/notifications", label: "Уведомления", icon: "🔔" },
];

async function HomeLink() {
  const auth = await getAuth();
  if (!auth) return null;
  return <Link href={await homePathFor(auth)} className="text-sm text-brand-600">← В кабинет</Link>;
}

export default function CommonLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell title="Оптовые заказы" root="/account" nav={NAV} context={<HomeLink />}>
      {children}
    </AppShell>
  );
}

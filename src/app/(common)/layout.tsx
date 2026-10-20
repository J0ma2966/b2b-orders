import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { getAuth, homePathFor } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";

const NAV = [
  { href: "/account", label: "Профиль", icon: "👤" },
  { href: "/notifications", label: "Уведомления", icon: "🔔" },
];

async function HomeLink() {
  const [auth, t] = await Promise.all([getAuth(), getT()]);
  if (!auth) return null;
  return <Link href={await homePathFor(auth)} className="text-sm text-brand-600">{t("← В кабинет")}</Link>;

}

export default function CommonLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell title="Оптовые заказы" root="/account" nav={NAV} context={<HomeLink />}>
      {children}
    </AppShell>
  );
}

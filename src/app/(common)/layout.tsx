import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Spinner } from "@/components/ui";
import { AppShell } from "@/components/shell/app-shell";
import { CourierShell } from "@/components/shell/courier-shell";
import { ShopShell } from "@/components/shell/shop-shell";
import { SHOP_MOBILE_NAV, SHOP_NAV } from "@/components/shell/shop-nav";
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

// Профиль и уведомления открываются в оформлении своей роли: у магазина — витрина, у доставщика — его приложение
async function RoleShell({ children }: { children: ReactNode }) {
  const auth = await getAuth();
  const home = auth ? await homePathFor(auth) : null;
  if (home === "/shop") return <ShopShell nav={SHOP_NAV} mobileNav={SHOP_MOBILE_NAV}>{children}</ShopShell>;
  if (home === "/courier") return <CourierShell>{children}</CourierShell>;
  return (
    <AppShell title="Оптовые заказы" root="/account" nav={NAV} context={<HomeLink />}>
      {children}
    </AppShell>
  );
}

export default function CommonLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<Spinner />}>
      <RoleShell>{children}</RoleShell>
    </Suspense>
  );
}

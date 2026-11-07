import type { ReactNode } from "react";
import { getSupplierContext } from "@/lib/auth/current";
import { supplierBadges } from "@/lib/nav-badges";
import { SupplierSwitcher } from "@/app/supplier/switcher";
import { SUPPLIER_MOBILE_NAV, SUPPLIER_MORE, SUPPLIER_NAV } from "@/app/supplier/nav";
import { AppShell } from "./app-shell";
import { BottomNav, SideNav } from "./nav-links";

// Кабинет поставщика: на компьютере — меню слева, на телефоне и в приложении — нижняя панель и экран «Ещё».
// Тема «supplier» — фиолетовый с белым (globals.css)
export function SupplierShell({ children }: { children: ReactNode }) {
  return (
    <div data-theme="supplier" className="flex min-h-full flex-1 flex-col bg-page text-ink">
    <AppShell
      title="Кабинет поставщика"
      root="/supplier"
      nav={SUPPLIER_NAV}
      mobileNav={SUPPLIER_MOBILE_NAV}
      bottom={<SupplierBottomNav />}
      side={<SupplierSideNav />}
      context={<SupplierSwitcher />}
    >
      {children}
    </AppShell>
    </div>
  );
}

// Счётчики: заказы, которые ждут ответа, мои доставки (если поставщик развозит сам)
// и непрочитанные уведомления по разделам; «Ещё» собирает разделы, которых нет в нижней панели
async function loadSupplierBadges() {
  const ctx = await getSupplierContext();
  if (!ctx || ctx.membership.role === "COURIER") return null;
  return supplierBadges(ctx.auth.user.id, ctx.supplier.id, {
    active: ctx.supplier.status === "ACTIVE",
    delivers: ctx.membership.delivers,
    allHrefs: SUPPLIER_NAV.map((i) => i.href),
    mobileHrefs: SUPPLIER_MOBILE_NAV.map((i) => i.href),
    overflowHref: SUPPLIER_MORE,
  });
}

async function SupplierBottomNav() {
  const badges = await loadSupplierBadges();
  return <BottomNav items={SUPPLIER_MOBILE_NAV} root="/supplier" badges={badges?.bottom} />;
}

async function SupplierSideNav() {
  const badges = await loadSupplierBadges();
  return <SideNav items={SUPPLIER_NAV} root="/supplier" badges={badges?.side} />;
}

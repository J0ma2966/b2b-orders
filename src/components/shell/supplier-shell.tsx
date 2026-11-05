import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { getSupplierContext } from "@/lib/auth/current";
import { SupplierSwitcher } from "@/app/supplier/switcher";
import { SUPPLIER_MOBILE_NAV, SUPPLIER_NAV } from "@/app/supplier/nav";
import { AppShell } from "./app-shell";
import { BottomNav } from "./nav-links";

// Кабинет поставщика: на компьютере — меню слева, на телефоне и в приложении — нижняя панель и экран «Ещё»
export function SupplierShell({ children }: { children: ReactNode }) {
  return (
    <AppShell
      title="Кабинет поставщика"
      root="/supplier"
      nav={SUPPLIER_NAV}
      mobileNav={SUPPLIER_MOBILE_NAV}
      bottom={<SupplierBottomNav />}
      context={<SupplierSwitcher />}
    >
      {children}
    </AppShell>
  );
}

// Счётчики: заказы, которые ждут ответа, и мои доставки (если поставщик развозит сам)
async function SupplierBottomNav() {
  const ctx = await getSupplierContext();
  if (!ctx || ctx.supplier.status !== "ACTIVE" || ctx.membership.role === "COURIER") return <BottomNav items={SUPPLIER_MOBILE_NAV} root="/supplier" />;
  const supplierId = ctx.supplier.id;
  const [waiting, mine] = await Promise.all([
    db.order.count({ where: { supplierId, status: { in: ["PLACED", "NEEDS_CONFIRMATION", "DELIVERY_PROBLEM"] } } }),
    ctx.membership.delivers ? db.order.count({ where: { supplierId, courierId: ctx.auth.user.id, status: { in: ["ASSIGNED", "IN_TRANSIT"] } } }) : 0,
  ]);
  return <BottomNav items={SUPPLIER_MOBILE_NAV} root="/supplier" badges={{ "/supplier/orders": waiting, "/supplier/delivery": mine }} />;
}

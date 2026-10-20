import Link from "next/link";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui";
import { SupplierCard } from "@/components/supplier-card";
import { requireShop } from "@/lib/auth/current";
import { availableSuppliersForShop, loadTerritoryMap } from "@/lib/territory";
import { territoryLabel } from "@/lib/territory-core";
import { SHOP_STATUS_COLOR, SHOP_STATUS_LABEL } from "@/lib/statuses";
import { db } from "@/lib/db";
import { OrdersList } from "@/components/orders/order-view";
import { orderStatusFilter } from "@/lib/order-core";
import { getT } from "@/lib/i18n/server";

export default async function ShopHome() {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  const shop = ctx.shop;
  const [suppliers, byId, active] = await Promise.all([
    availableSuppliersForShop(shop.territoryId),
    loadTerritoryMap(),
    db.order.findMany({ where: { shopId: shop.id, status: orderStatusFilter("active") }, include: { supplier: true }, orderBy: { placedAt: "desc" }, take: 5 }),
  ]);
  return (
    <>
      <PageHeader
        title={shop.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge color={SHOP_STATUS_COLOR[shop.status]}>{SHOP_STATUS_LABEL[shop.status]}</Badge>
            <span>{territoryLabel(shop.territoryId, byId, t)}</span>
          </span>
        }
      />
      {shop.isBlocked ? (
        <Alert tone="error">{t("Магазин заблокирован администратором платформы. Заказы недоступны.")}</Alert>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-2 font-semibold">{t("Заказы в работе")}</h2>
              <OrdersList rows={active} href={(id) => `/shop/orders/${id}`} party={(o) => o.supplier.displayName} />
              <Link href="/shop/orders" className="mt-2 inline-block text-sm text-brand-600">{t("Все заказы →")}</Link>
            </div>
          )}
          <h2 className="mb-2 font-semibold">{t("Поставщики в вашем районе")}</h2>
          {suppliers.length === 0 ? (
            <EmptyState>{t("Пока ни один поставщик не доставляет в ваш район. Мы сообщим, когда появятся.")}</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {suppliers.slice(0, 6).map((s) => (
                <SupplierCard key={s.id} s={s} />
              ))}
            </div>
          )}
          {suppliers.length > 6 && (
            <Link href="/shop/suppliers" className="mt-3 inline-block text-sm text-brand-600">{t("Все поставщики ({n}) →", { n: suppliers.length })}</Link>

          )}
        </>
      )}
    </>
  );
}

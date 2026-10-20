import Link from "next/link";
import { Alert, Badge, EmptyState } from "@/components/ui";
import { SupplierCard } from "@/components/supplier-card";
import { ShopOrderCards } from "@/components/shop/order-tracker";
import { requireShop } from "@/lib/auth/current";
import { availableSuppliersForShop, loadTerritoryMap } from "@/lib/territory";
import { territoryLabel } from "@/lib/territory-core";
import { SHOP_STATUS_COLOR, SHOP_STATUS_LABEL } from "@/lib/statuses";
import { db } from "@/lib/db";
import { orderStatusFilter } from "@/lib/order-core";
import { getT } from "@/lib/i18n/server";

export default async function ShopHome() {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  const shop = ctx.shop;
  const [suppliers, byId, active, carts] = await Promise.all([
    availableSuppliersForShop(shop.territoryId),
    loadTerritoryMap(),
    db.order.findMany({ where: { shopId: shop.id, status: orderStatusFilter("active") }, include: { supplier: true }, orderBy: { placedAt: "desc" }, take: 4 }),
    db.order.findMany({
      where: { shopId: shop.id, status: "DRAFT", items: { some: {} } },
      include: { supplier: true, _count: { select: { items: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">{shop.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <Badge color={SHOP_STATUS_COLOR[shop.status]}>{SHOP_STATUS_LABEL[shop.status]}</Badge>
          <span>{territoryLabel(shop.territoryId, byId, t)}</span>
        </div>
      </div>
      {shop.isBlocked ? (
        <Alert tone="error">{t("Магазин заблокирован администратором платформы. Заказы недоступны.")}</Alert>
      ) : (
        <div className="space-y-8">
          {carts.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg font-semibold">{t("Корзины ждут оформления")}</h2>
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
                {carts.map((c) => (
                  <Link
                    key={c.id}
                    href={`/shop/cart/${c.supplierId}`}
                    className="flex w-64 shrink-0 snap-start flex-col rounded-2xl bg-accent/15 p-4 ring-1 ring-accent/40 hover:ring-accent"
                  >
                    <span className="truncate font-semibold">{c.supplier.displayName}</span>
                    <span className="text-sm text-gray-600">
                      {c._count.items} {t.plural(c._count.items, "позиция", "позиции", "позиций")}
                    </span>
                    <span className="mt-3 flex items-center justify-between">
                      <span className="text-lg font-bold tabular-nums">{t.money(c.total)}</span>
                      <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-on-accent">{t("Оформить")}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {active.length > 0 && (
            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-semibold">{t("Заказы в работе")}</h2>
                <Link href="/shop/orders" className="text-sm font-medium text-brand-700">{t("Все заказы")}</Link>
              </div>
              <ShopOrderCards rows={active} />
            </section>
          )}

          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">{t("Поставщики в вашем районе")}</h2>
              {suppliers.length > 6 && (
                <Link href="/shop/suppliers" className="text-sm font-medium text-brand-700">{t("Все поставщики ({n})", { n: suppliers.length })}</Link>
              )}
            </div>
            {suppliers.length === 0 ? (
              <EmptyState>{t("Пока ни один поставщик не доставляет в ваш район. Мы сообщим, когда появятся.")}</EmptyState>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {suppliers.slice(0, 6).map((s) => (
                  <SupplierCard key={s.id} s={s} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

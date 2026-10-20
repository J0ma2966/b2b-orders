import Link from "next/link";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui";
import { SupplierCard } from "@/components/supplier-card";
import { requireShop } from "@/lib/auth/current";
import { availableSuppliersForShop, loadTerritoryMap } from "@/lib/territory";
import { territoryLabel } from "@/lib/territory-core";
import { SHOP_STATUS_COLOR, SHOP_STATUS_LABEL } from "@/lib/statuses";

export default async function ShopHome() {
  const ctx = await requireShop();
  const shop = ctx.shop;
  const [suppliers, byId] = await Promise.all([availableSuppliersForShop(shop.territoryId), loadTerritoryMap()]);
  return (
    <>
      <PageHeader
        title={shop.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge color={SHOP_STATUS_COLOR[shop.status]}>{SHOP_STATUS_LABEL[shop.status]}</Badge>
            <span>{territoryLabel(shop.territoryId, byId)}</span>
          </span>
        }
      />
      {shop.isBlocked ? (
        <Alert tone="error">Магазин заблокирован администратором платформы. Заказы недоступны.</Alert>
      ) : (
        <>
          <h2 className="mb-2 font-semibold">Поставщики в вашем районе</h2>
          {suppliers.length === 0 ? (
            <EmptyState>Пока ни один поставщик не доставляет в ваш район. Мы сообщим, когда появятся.</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {suppliers.slice(0, 6).map((s) => (
                <SupplierCard key={s.id} s={s} />
              ))}
            </div>
          )}
          {suppliers.length > 6 && (
            <Link href="/shop/suppliers" className="mt-3 inline-block text-sm text-brand-600">Все поставщики ({suppliers.length}) →</Link>
          )}
        </>
      )}
    </>
  );
}

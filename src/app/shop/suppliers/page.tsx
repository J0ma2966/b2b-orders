import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { SupplierCard } from "@/components/supplier-card";
import { requireShop } from "@/lib/auth/current";
import { availableSuppliersForShop } from "@/lib/territory";

export default async function ShopSuppliersPage() {
  const ctx = await requireShop();
  if (ctx.shop.isBlocked) return <Alert tone="error">Магазин заблокирован администратором платформы.</Alert>;
  const suppliers = await availableSuppliersForShop(ctx.shop.territoryId);
  return (
    <>
      <PageHeader title="Поставщики" subtitle="Доставляют по адресу вашего магазина" />
      {suppliers.length === 0 ? (
        <EmptyState>Пока ни один поставщик не доставляет в ваш район.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <SupplierCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </>
  );
}

import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { SupplierSearchList } from "@/components/shop/supplier-search";
import { SupplierCard } from "@/components/supplier-card";
import { requireShop } from "@/lib/auth/current";
import { availableSuppliersForShop } from "@/lib/territory";
import { getT } from "@/lib/i18n/server";
import { SupportLink } from "@/components/support-link";


export default async function ShopSuppliersPage() {
  const t = await getT();
  const ctx = await requireShop();
  if (ctx.shop.isBlocked)
    return (
      <Alert tone="error">
        {t("Магазин заблокирован администратором платформы.")}{" "}
        <SupportLink topic="blocked" className="underline">{t("Написать в поддержку")}</SupportLink>
      </Alert>
    );
  const suppliers = await availableSuppliersForShop(ctx.shop.territoryId);
  return (
    <>
      <PageHeader title="Поставщики" subtitle="Доставляют по адресу вашего магазина" />
      {suppliers.length === 0 ? (
        <EmptyState>{t("Пока ни один поставщик не доставляет в ваш район.")}</EmptyState>
      ) : (
        <SupplierSearchList items={suppliers.map((s) => ({ id: s.id, text: `${s.displayName} ${s.description ?? ""}`, node: <SupplierCard s={s} /> }))} />
      )}
    </>
  );
}

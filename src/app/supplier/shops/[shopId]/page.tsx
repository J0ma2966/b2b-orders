import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, DefinitionList, PageHeader } from "@/components/ui";
import { balanceLabel, OrdersList } from "@/components/orders/order-view";
import { DebtHistory } from "@/components/orders/debt-history";
import { CreditForm, DebtPaymentForm } from "@/components/orders/finance-forms";
import { CorrectionForm } from "@/components/orders/supplier-forms";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { debtEntries } from "@/lib/delivery";
import { formatPhone } from "@/lib/phone";
import { SHOP_STATUS_COLOR, SHOP_STATUS_LABEL } from "@/lib/statuses";
import { getT } from "@/lib/i18n/server";

export default async function SupplierShopPage({ params }: PageProps<"/supplier/shops/[shopId]">) {
  const t = await getT();
  const ctx = await requireActiveSupplier();
  const { shopId } = await params;
  const [shop, account, orders, stats] = await Promise.all([
    db.shop.findUnique({ where: { id: shopId } }),
    db.shopAccount.findUnique({ where: { shopId_supplierId: { shopId, supplierId: ctx.supplier.id } } }),
    db.order.findMany({ where: { shopId, supplierId: ctx.supplier.id, status: { not: "DRAFT" } }, orderBy: { placedAt: "desc" }, take: 20 }),
    db.order.aggregate({ where: { shopId, supplierId: ctx.supplier.id, status: { in: ["COMPLETED", "PARTIALLY_ACCEPTED"] } }, _sum: { total: true }, _count: true }),
  ]);
  if (!shop || (orders.length === 0 && !account)) notFound();
  const entries = account ? await debtEntries(account.id) : [];
  const balance = Number(account?.balance ?? 0);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
  return (
    <>
      <PageHeader
        title={shop.name}
        subtitle={<span className="flex items-center gap-2"><Badge color={SHOP_STATUS_COLOR[shop.status]}>{SHOP_STATUS_LABEL[shop.status]}</Badge>{shop.isBlocked && <Badge color="red">{t("Заблокирован")}</Badge>}</span>}
        actions={<Link href="/supplier/shops" className="text-sm text-brand-600">{t("← Магазины")}</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-3 gap-3">
            <Card><div className={balance > 0 ? "text-xl font-semibold text-red-700" : "text-xl font-semibold"}>{balanceLabel(balance, t)}</div><div className="text-sm text-gray-500">{t("Задолженность")}</div></Card>
            <Card><div className="text-xl font-semibold">{stats._count}</div><div className="text-sm text-gray-500">{t("Получено заказов")}</div></Card>
            <Card><div className="text-xl font-semibold">{t.money(stats._sum.total ?? 0)}</div><div className="text-sm text-gray-500">{t("Оборот")}</div></Card>
          </div>
          <h2 className="font-semibold">{t("История задолженности")}</h2>
          <DebtHistory entries={entries} orderHref={(id) => `/supplier/orders/${id}`} />
          <h2 className="font-semibold">{t("Заказы")}</h2>
          <OrdersList rows={orders} href={(id) => `/supplier/orders/${id}`} party={() => shop.name} />
        </div>
        <div className="space-y-4">
          <Card>
            <DefinitionList
              items={[
                ["Телефон", <a key="p" href={`tel:${shop.phone}`} className="text-brand-600">{formatPhone(shop.phone)}</a>],
                ["Контакт", shop.contactName],
                ["Адрес", shop.address],
                ["ИНН", shop.inn],
                ["Регистрация", t.date(shop.createdAt)],
              ]}
            />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{t("Работа в долг")}</h2>
            <CreditForm shopId={shop.id} creditAllowed={account?.creditAllowed ?? false} creditLimit={account?.creditLimit?.toString() ?? ""} />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{t("Погашение задолженности")}</h2>
            <DebtPaymentForm shopId={shop.id} today={today} />
          </Card>
          <Card>
            <h2 className="mb-1 font-semibold">{t("Корректировка")}</h2>
            <p className="mb-3 text-xs text-gray-500">{t("Исправление ошибок: исходные операции не меняются.")}</p>
            <CorrectionForm shopId={shop.id} />
          </Card>
        </div>
      </div>
    </>
  );
}

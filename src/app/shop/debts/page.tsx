import { Card, EmptyState, PageHeader } from "@/components/ui";
import { balanceLabel } from "@/components/orders/order-view";
import { DebtHistory } from "@/components/orders/debt-history";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { debtEntries } from "@/lib/delivery";
import { getT } from "@/lib/i18n/server";

// Задолженность магазина по каждому поставщику (ТЗ п. 75)
export default async function ShopDebtsPage() {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  const accounts = await db.shopAccount.findMany({ where: { shopId: ctx.shop.id }, include: { supplier: true }, orderBy: { balance: "desc" } });
  const histories = await Promise.all(accounts.map((a) => debtEntries(a.id, 50)));
  const total = accounts.reduce((s, a) => s + Math.max(0, Number(a.balance)), 0);
  return (
    <>
      <PageHeader title="Задолженность" subtitle={t("Всего долг: {sum}", { sum: t.money(total) })} />
      {accounts.length === 0 && <EmptyState>{t("Задолженности нет")}</EmptyState>}
      <div className="space-y-6">
        {accounts.map((a, i) => (
          <section key={a.id} className="space-y-2">
            <Card className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{a.supplier.displayName}</div>
                <div className="text-xs text-gray-500">{a.creditAllowed ? (a.creditLimit ? t("Работа в долг разрешена, лимит {sum}", { sum: t.money(a.creditLimit) }) : t("Работа в долг разрешена")) : t("Работа в долг не разрешена")}</div>
              </div>
              <div className={Number(a.balance) > 0 ? "text-lg font-semibold text-red-700" : "text-lg font-semibold"}>{balanceLabel(Number(a.balance), t)}</div>

            </Card>
            <DebtHistory entries={histories[i]} orderHref={(id) => `/shop/orders/${id}`} />
          </section>
        ))}
      </div>
    </>
  );
}

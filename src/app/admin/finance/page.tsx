import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { balanceLabel } from "@/components/orders/order-view";
import { DEBT_TYPE_LABEL } from "@/components/orders/debt-history";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { PAYMENT_LABEL } from "@/lib/order-core";
import type { DebtEntryType } from "@/generated/prisma/enums";
import { getT } from "@/lib/i18n/server";
import { multiOverdueShops } from "@/lib/accounts";
import { MultiOverdueList } from "@/components/admin/multi-overdue";

// Финансы платформы: задолженности и финансовые операции (ТЗ п. 72, 79)
export default async function AdminFinancePage({ searchParams }: PageProps<"/admin/finance">) {
  const t = await getT();
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const type = typeof sp.status === "string" && sp.status in DEBT_TYPE_LABEL ? (sp.status as DebtEntryType) : undefined;
  const nameFilter = q ? { OR: [{ shop: { name: { contains: q, mode: "insensitive" as const } } }, { supplier: { displayName: { contains: q, mode: "insensitive" as const } } }] } : {};
  const [risky, accounts, entries] = await Promise.all([
    multiOverdueShops(),
    db.shopAccount.findMany({ where: { balance: { not: 0 }, ...nameFilter }, include: { shop: true, supplier: true }, orderBy: { balance: "desc" }, take: 100 }),
    db.debtEntry.findMany({ where: { ...(type && { type }), account: nameFilter }, include: { account: { include: { shop: true, supplier: true } }, order: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return (
    <>
      <PageHeader title="Финансы" subtitle="Платформа ведёт учёт, деньги не проходят через неё" />
      <FilterBar q={q} status={type} statuses={Object.entries(DEBT_TYPE_LABEL)} allLabel="Все операции" placeholder="Магазин или поставщик" />
      <section id="risk" className="mb-6">
        <h2 className="font-semibold">{t("Просрочка у нескольких поставщиков")}</h2>
        <p className="mb-2 text-sm text-gray-500">{t("По срокам оплаты, которые задали поставщики. Видно только администратору")}</p>
        <MultiOverdueList rows={q ? risky.filter((r) => r.shop.name.toLowerCase().includes(q.toLowerCase())) : risky} />
      </section>
      <h2 className="mb-2 font-semibold">{t("Задолженности")}</h2>
      {accounts.length === 0 ? <EmptyState>{t("Задолженностей нет")}</EmptyState> : (
        <Card className="mb-6 p-0 sm:p-0">
          <ul className="divide-y divide-gray-100">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-sm">
                <span><Link className="text-brand-600" href={`/admin/shops/${a.shopId}`}>{a.shop.name}</Link> → {a.supplier.displayName}{a.creditAllowed ? ` · ${t("в долг разрешено")}` : ""}</span>
                <b className={Number(a.balance) > 0 ? "text-red-700" : ""}>{balanceLabel(Number(a.balance), t)}</b>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <h2 className="mb-2 font-semibold">{t("Финансовые операции")}</h2>
      {entries.length === 0 ? <EmptyState>{t("Операций нет")}</EmptyState> : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-3 py-2 text-left">{t("Дата")}</th><th className="px-3 text-left">{t("Магазин → поставщик")}</th><th className="px-3 text-left">{t("Операция")}</th><th className="px-3 text-left">{t("Заказ")}</th><th className="px-3 text-right">{t("Сумма")}</th><th className="px-3 text-right">{t("Остаток")}</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-1.5 whitespace-nowrap">{t.dateTime(e.occurredAt)}</td>
                  <td className="px-3">{e.account.shop.name} → {e.account.supplier.displayName}</td>
                  <td className="px-3">{t(DEBT_TYPE_LABEL[e.type])}{e.paymentMethod && ` · ${t(PAYMENT_LABEL[e.paymentMethod])}`}{e.comment && <div className="text-xs text-gray-500">{t(e.comment)}</div>}</td>
                  <td className="px-3">{e.order ? <Link className="text-brand-600" href={`/admin/orders/${e.order.id}`}>№{e.order.number}</Link> : "—"}</td>
                  <td className="px-3 text-right">{Number(e.amount) > 0 ? "+" : ""}{t.money(e.amount)}</td>
                  <td className="px-3 text-right whitespace-nowrap">{balanceLabel(Number(e.balanceAfter), t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

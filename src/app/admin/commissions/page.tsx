import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PeriodTabs } from "@/components/reports/report-view";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { defaultCommissionRate } from "@/lib/orders";
import { orderValue } from "@/lib/finance-core";
import { parsePeriod, periodRange, toLocalDateInput } from "@/lib/report-core";
import { getT } from "@/lib/i18n/server";
import { InvoiceList } from "@/components/commission/invoice-list";
import { InvoiceStatusForm, IssueInvoicesForm } from "@/components/commission/invoice-forms";

// Расчётная комиссия по поставщикам за период (ТЗ п. 52–53): ставка берётся из заказа
export default async function CommissionsPage({ searchParams }: PageProps<"/admin/commissions">) {
  const t = await getT();
  await requireSuperAdmin();
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const range = periodRange(period, new Date(), { from: typeof sp.from === "string" ? sp.from : undefined, to: typeof sp.to === "string" ? sp.to : undefined });
  const [orders, suppliers, def, invoices, unpaid] = await Promise.all([
    db.order.findMany({ where: { status: { in: ["COMPLETED", "PARTIALLY_ACCEPTED"] }, completedAt: { gte: range.from, lt: range.to } }, select: { supplierId: true, total: true, correctionTotal: true, commissionRate: true } }),
    db.supplier.findMany({ where: { status: { in: ["ACTIVE", "BLOCKED"] } }, select: { id: true, displayName: true, commissionRate: true } }),
    defaultCommissionRate(),
    db.commissionInvoice.findMany({ include: { supplier: { select: { displayName: true } } }, orderBy: [{ period: "desc" }, { number: "desc" }], take: 100 }),
    db.commissionInvoice.aggregate({ where: { status: "ISSUED" }, _sum: { amount: true } }),
  ]);
  const rows = suppliers.map((s) => {
    const mine = orders.filter((o) => o.supplierId === s.id);
    const value = (o: (typeof mine)[number]) => orderValue(Number(o.total), Number(o.correctionTotal));
    const turnover = mine.reduce((t, o) => t + value(o), 0);
    const commission = mine.reduce((t, o) => t + (value(o) * Number(o.commissionRate ?? 0)) / 100, 0);
    return { ...s, orders: mine.length, turnover, commission, rate: s.commissionRate !== null ? Number(s.commissionRate) : def };
  }).filter((r) => r.orders > 0).sort((a, b) => b.commission - a.commission);
  const to = toLocalDateInput(new Date(range.to.getTime() - 1));
  return (
    <>
      <PageHeader title="Комиссии" subtitle={`Стандартная ставка ${def}%. Оплата комиссии — вне платформы.`} />
      <PeriodTabs base="/admin/commissions" period={period} params={{}} from={toLocalDateInput(range.from)} to={to} />
      {rows.length === 0 ? <EmptyState>{t("Продаж за период нет")}</EmptyState> : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="stack-table w-full text-sm sm:min-w-[560px]">
            <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-4 py-2 text-left">{t("Поставщик")}</th><th className="px-2 text-right">{t("Заказов")}</th><th className="px-2 text-right">{t("Оборот")}</th><th className="px-2 text-right">{t("Текущая ставка")}</th><th className="px-4 text-right">{t("Комиссия")}</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}><td className="px-4 py-2 font-medium sm:font-normal">{r.displayName}</td><td data-label={t("Заказов")} className="px-2 text-right">{r.orders}</td><td data-label={t("Оборот")} className="px-2 text-right whitespace-nowrap">{t.money(r.turnover)}</td><td data-label={t("Текущая ставка")} className="px-2 text-right">{r.rate}%</td><td data-label={t("Комиссия")} className="px-4 text-right font-medium whitespace-nowrap">{t.money(r.commission)}</td></tr>
              ))}
              <tr className="font-semibold"><td className="px-4 py-2">{t("Итого")}</td><td data-label={t("Заказов")} className="px-2 text-right">{rows.reduce((t, r) => t + r.orders, 0)}</td><td data-label={t("Оборот")} className="px-2 text-right whitespace-nowrap">{t.money(rows.reduce((t, r) => t + r.turnover, 0))}</td><td /><td data-label={t("Комиссия")} className="px-4 text-right whitespace-nowrap">{t.money(rows.reduce((t, r) => t + r.commission, 0))}</td></tr>
            </tbody>
          </table>
        </Card>
      )}
      <section className="mt-8 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">{t("Счета на комиссию")}</h2>
            <p className="text-sm text-gray-500">{t("Выставляются автоматически 1-го числа за прошлый месяц. Не оплачено: {sum}", { sum: t.money(unpaid._sum.amount ?? 0) })}</p>
          </div>
          <IssueInvoicesForm />
        </div>
        {invoices.length === 0 ? <EmptyState>{t("Счетов пока нет")}</EmptyState> : <InvoiceList rows={invoices} action={(r) => <InvoiceStatusForm invoiceId={r.id} />} />}
      </section>
    </>
  );
}

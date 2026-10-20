import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PeriodTabs } from "@/components/reports/report-view";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { formatMoney } from "@/lib/format";
import { defaultCommissionRate } from "@/lib/orders";
import { parsePeriod, periodRange, toLocalDateInput } from "@/lib/report-core";

// Расчётная комиссия по поставщикам за период (ТЗ п. 52–53): ставка берётся из заказа
export default async function CommissionsPage({ searchParams }: PageProps<"/admin/commissions">) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const range = periodRange(period, new Date(), { from: typeof sp.from === "string" ? sp.from : undefined, to: typeof sp.to === "string" ? sp.to : undefined });
  const [orders, suppliers, def] = await Promise.all([
    db.order.findMany({ where: { status: { in: ["COMPLETED", "PARTIALLY_ACCEPTED"] }, completedAt: { gte: range.from, lt: range.to } }, select: { supplierId: true, total: true, correctionTotal: true, commissionRate: true } }),
    db.supplier.findMany({ where: { status: { in: ["ACTIVE", "BLOCKED"] } }, select: { id: true, displayName: true, commissionRate: true } }),
    defaultCommissionRate(),
  ]);
  const rows = suppliers.map((s) => {
    const mine = orders.filter((o) => o.supplierId === s.id);
    const turnover = mine.reduce((t, o) => t + Number(o.total) + Number(o.correctionTotal), 0);
    const commission = mine.reduce((t, o) => t + ((Number(o.total) + Number(o.correctionTotal)) * Number(o.commissionRate ?? 0)) / 100, 0);
    return { ...s, orders: mine.length, turnover, commission, rate: s.commissionRate !== null ? Number(s.commissionRate) : def };
  }).filter((r) => r.orders > 0).sort((a, b) => b.commission - a.commission);
  const to = toLocalDateInput(new Date(range.to.getTime() - 1));
  return (
    <>
      <PageHeader title="Комиссии" subtitle={`Стандартная ставка ${def}%. Оплата комиссии — вне платформы.`} />
      <PeriodTabs base="/admin/commissions" period={period} params={{}} from={toLocalDateInput(range.from)} to={to} />
      {rows.length === 0 ? <EmptyState>Продаж за период нет</EmptyState> : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-4 py-2 text-left">Поставщик</th><th className="px-2 text-right">Заказов</th><th className="px-2 text-right">Оборот</th><th className="px-2 text-right">Текущая ставка</th><th className="px-4 text-right">Комиссия</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}><td className="px-4 py-2">{r.displayName}</td><td className="px-2 text-right">{r.orders}</td><td className="px-2 text-right">{formatMoney(r.turnover)}</td><td className="px-2 text-right">{r.rate}%</td><td className="px-4 text-right font-medium">{formatMoney(r.commission)}</td></tr>
              ))}
              <tr className="font-semibold"><td className="px-4 py-2">Итого</td><td className="px-2 text-right">{rows.reduce((t, r) => t + r.orders, 0)}</td><td className="px-2 text-right">{formatMoney(rows.reduce((t, r) => t + r.turnover, 0))}</td><td /><td className="px-4 text-right">{formatMoney(rows.reduce((t, r) => t + r.commission, 0))}</td></tr>
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

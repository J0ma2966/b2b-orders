import Link from "next/link";
import type { ReactNode } from "react";
import { Card, cn } from "@/components/ui";
import { formatQty } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { PERIOD_LABEL, type Period } from "@/lib/report-core";
import { REPLACEMENT_STATUS_LABEL } from "@/lib/replacement-core";
import type { Report } from "@/lib/reports";

export function PeriodTabs({ base, period, params, from, to, children }: { base: string; period: Period; params: Record<string, string>; from: string; to: string; children?: ReactNode }) {
  const href = (p: Period) => `${base}?${new URLSearchParams({ ...params, period: p })}`;
  return (
    <div className="mb-4 space-y-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {(Object.keys(PERIOD_LABEL) as Period[]).filter((p) => p !== "custom").map((p) => (
          <Link key={p} href={href(p)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm", period === p ? "bg-brand-600 text-white" : "bg-white ring-1 ring-gray-200")}>{PERIOD_LABEL[p]}</Link>
        ))}
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="period" value="custom" />
        {Object.entries(params).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="text-sm">С <input type="date" name="from" defaultValue={from} className="ml-1 rounded-lg px-2 py-1.5 ring-1 ring-gray-300" /></label>
        <label className="text-sm">по <input type="date" name="to" defaultValue={to} className="ml-1 rounded-lg px-2 py-1.5 ring-1 ring-gray-300" /></label>
        {children}
        <button className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-gray-300">Показать</button>
      </form>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="text-lg font-semibold sm:text-xl">{value}</div>
      <div className="text-xs text-gray-500 sm:text-sm">{label}</div>
    </Card>
  );
}

type Group = { key: string; amount: number; qty: number; count: number };

function GroupTable({ title, rows, money = true, qty = true, count, keyLabel }: { title: string; rows: Group[]; money?: boolean; qty?: boolean; count?: string; keyLabel?: (k: string) => string }) {
  return (
    <Card className="p-0 sm:p-0">
      <h3 className="px-4 pt-3 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-500">Нет данных</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {rows.slice(0, 15).map((r) => (
              <tr key={r.key}>
                <td className="px-4 py-1.5">{keyLabel ? keyLabel(r.key) : r.key}</td>
                {count && <td className="px-2 py-1.5 text-right text-gray-500">{r.count} {count}</td>}
                {qty && <td className="px-2 py-1.5 text-right text-gray-500">{formatQty(r.qty)}</td>}
                {money && <td className="px-4 py-1.5 text-right font-medium">{formatMoney(r.amount)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function ReportView({ r, scope }: { r: Report; scope: "supplier" | "admin" }) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-semibold">Продажи</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Оборот" value={formatMoney(r.sales.turnover)} />
          <Tile label="Получено заказов" value={r.sales.orders} />
          <Tile label="Оформлено заказов" value={r.sales.placed} />
          <Tile label="Средний заказ" value={formatMoney(r.sales.orders ? r.sales.turnover / r.sales.orders : 0)} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <GroupTable title="Продажи по товарам" rows={r.sales.byProduct} />
          <GroupTable title="Продажи по категориям" rows={r.sales.byCategory} />
          <GroupTable title="Продажи по магазинам" rows={r.sales.byShop} qty={false} count="зак." />
          {scope === "admin" ? <GroupTable title="Оборот по поставщикам" rows={r.sales.bySupplier} qty={false} count="зак." /> : <GroupTable title="Проданные единицы" rows={r.sales.soldUnits} />}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Финансы</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Сумма заказов" value={formatMoney(r.finance.ordersSum)} />
          <Tile label="Оплачено" value={formatMoney(r.finance.paid)} />
          <Tile label="Образовалось долга" value={formatMoney(r.finance.debtFormed)} />
          <Tile label="Погашено" value={formatMoney(r.finance.repaid)} />
          <Tile label="Текущий долг магазинов" value={formatMoney(r.finance.currentDebt)} />
          <Tile label="Корректировки" value={formatMoney(r.finance.corrections)} />
          <Tile label="Расчётная комиссия платформы" value={formatMoney(r.finance.commission)} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <GroupTable title="Должники" rows={r.finance.debtors.map((d) => ({ key: scope === "admin" ? `${d.shop} → ${d.supplier}` : d.shop, amount: d.balance, qty: 0, count: 0 }))} qty={false} />
          {scope === "admin" && <GroupTable title="Комиссия по поставщикам" rows={r.finance.commissionBySupplier} qty={false} count="зак." />}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Товары</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <GroupTable title="Самые продаваемые" rows={r.products.top} />
          <GroupTable title="Наименее продаваемые" rows={r.products.least} />
          <GroupTable title="Бонусные (расход по цене)" rows={r.products.bonus} />
          <GroupTable title="Принудительные продажи" rows={r.products.forced} />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Логистика</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile label="Доставки" value={r.logistics.deliveries} />
          <Tile label="Завершены полностью" value={r.logistics.completed} />
          <Tile label="Частично приняты" value={r.logistics.partial} />
          <Tile label="Не доставлены" value={r.logistics.notDelivered} />
          <Tile label="Отменены" value={r.logistics.cancelled} />
        </div>
        <Card className="overflow-x-auto p-0 sm:p-0">
          <h3 className="px-4 pt-3 text-sm font-semibold">Показатели доставщиков</h3>
          {r.logistics.couriers.length === 0 ? <p className="px-4 py-3 text-sm text-gray-500">Нет данных</p> : (
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-xs text-gray-500"><tr><th className="px-4 py-1 text-left">Доставщик</th><th className="px-2 text-right">Доставлено</th><th className="px-2 text-right">Частично</th><th className="px-2 text-right">Не доставлено</th><th className="px-4 text-right">Собрано денег</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {r.logistics.couriers.map((c) => (
                  <tr key={c.name}><td className="px-4 py-1.5">{c.name}</td><td className="px-2 text-right">{c.delivered}</td><td className="px-2 text-right">{c.partial}</td><td className="px-2 text-right">{c.notDelivered}</td><td className="px-4 text-right">{formatMoney(c.collected)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Замены · {r.replacements.count}</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <GroupTable title="По причинам" rows={r.replacements.byReason} money={false} count="заяв." />
          <GroupTable title="По товарам" rows={r.replacements.byProduct} money={false} count="заяв." />
          <GroupTable title="По магазинам" rows={r.replacements.byShop} money={false} count="заяв." />
          <GroupTable title="По статусам" rows={r.replacements.byStatus} money={false} count="заяв." keyLabel={(k) => REPLACEMENT_STATUS_LABEL[k as keyof typeof REPLACEMENT_STATUS_LABEL] ?? k} />
        </div>
      </section>
    </div>
  );
}

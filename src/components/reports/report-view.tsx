import Link from "next/link";
import type { ReactNode } from "react";
import { Card, cn } from "@/components/ui";
import { formatQty } from "@/lib/catalog";
import { PERIOD_LABEL, type Period } from "@/lib/report-core";
import { REPLACEMENT_STATUS_LABEL } from "@/lib/replacement-core";
import type { Report } from "@/lib/reports";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/core";

export async function PeriodTabs({ base, period, params, from, to, children }: { base: string; period: Period; params: Record<string, string>; from: string; to: string; children?: ReactNode }) {
  const t = await getT();
  const href = (p: Period) => `${base}?${new URLSearchParams({ ...params, period: p })}`;
  return (
    <div className="mb-4 space-y-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {(Object.keys(PERIOD_LABEL) as Period[]).filter((p) => p !== "custom").map((p) => (
          <Link key={p} href={href(p)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm", period === p ? "bg-brand-600 text-on-brand" : "bg-surface ring-1 ring-gray-200")}>{t(PERIOD_LABEL[p])}</Link>
        ))}
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="period" value="custom" />
        {Object.entries(params).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="text-sm">{t("С")} <input type="date" name="from" defaultValue={from} className="ml-1 rounded-lg px-2 py-1.5 ring-1 ring-gray-300" /></label>
        <label className="text-sm">{t("по")} <input type="date" name="to" defaultValue={to} className="ml-1 rounded-lg px-2 py-1.5 ring-1 ring-gray-300" /></label>
        {children}
        <button className="rounded-lg bg-surface px-3 py-1.5 text-sm ring-1 ring-gray-300">{t("Показать")}</button>
      </form>
    </div>
  );
}

function Tile({ label, value, t }: { label: string; value: ReactNode; t: T }) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="text-lg font-semibold sm:text-xl">{value}</div>
      <div className="text-xs text-gray-500 sm:text-sm">{t(label)}</div>
    </Card>
  );
}

type Group = { key: string; amount: number; qty: number; count: number };

function GroupTable({ t, title, rows, money = true, qty = true, count, keyLabel }: { t: T; title: string; rows: Group[]; money?: boolean; qty?: boolean; count?: string; keyLabel?: (k: string) => string }) {
  return (
    <Card className="p-0 sm:p-0">
      <h3 className="px-4 pt-3 text-sm font-semibold">{t(title)}</h3>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-500">{t("Нет данных")}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {rows.slice(0, 15).map((r) => (
              <tr key={r.key}>
                <td className="px-4 py-1.5">{keyLabel ? keyLabel(r.key) : t(r.key)}</td>
                {count && <td className="px-2 py-1.5 text-right text-gray-500">{r.count} {t(count)}</td>}
                {qty && <td className="px-2 py-1.5 text-right text-gray-500">{formatQty(r.qty)}</td>}
                {money && <td className="px-4 py-1.5 text-right font-medium">{t.money(r.amount)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export async function ReportView({ r, scope }: { r: Report; scope: "supplier" | "admin" }) {
  const t = await getT();
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-semibold">{t("Продажи")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile t={t} label="Оборот" value={t.money(r.sales.turnover)} />
          <Tile t={t} label="Получено заказов" value={r.sales.orders} />
          <Tile t={t} label="Оформлено заказов" value={r.sales.placed} />
          <Tile t={t} label="Средний заказ" value={t.money(r.sales.orders ? r.sales.turnover / r.sales.orders : 0)} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <GroupTable t={t} title={t("Продажи по товарам")} rows={r.sales.byProduct} />
          <GroupTable t={t} title={t("Продажи по категориям")} rows={r.sales.byCategory} />
          <GroupTable t={t} title={t("Продажи по магазинам")} rows={r.sales.byShop} qty={false} count="зак." />
          {scope === "admin" ? <GroupTable t={t} title={t("Оборот по поставщикам")} rows={r.sales.bySupplier} qty={false} count="зак." /> : <GroupTable t={t} title={t("Проданные единицы")} rows={r.sales.soldUnits} />}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">{t("Финансы")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile t={t} label="Сумма заказов" value={t.money(r.finance.ordersSum)} />
          <Tile t={t} label="Оплачено" value={t.money(r.finance.paid)} />
          <Tile t={t} label="Образовалось долга" value={t.money(r.finance.debtFormed)} />
          <Tile t={t} label="Погашено" value={t.money(r.finance.repaid)} />
          <Tile t={t} label="Текущий долг магазинов" value={t.money(r.finance.currentDebt)} />
          <Tile t={t} label="Корректировки" value={t.money(r.finance.corrections)} />
          <Tile t={t} label="Расчётная комиссия платформы" value={t.money(r.finance.commission)} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <GroupTable t={t} title={t("Должники")} rows={r.finance.debtors.map((d) => ({ key: scope === "admin" ? `${d.shop} → ${d.supplier}` : d.shop, amount: d.balance, qty: 0, count: 0 }))} qty={false} />
          {scope === "admin" && <GroupTable t={t} title={t("Комиссия по поставщикам")} rows={r.finance.commissionBySupplier} qty={false} count="зак." />}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">{t("Товары")}</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <GroupTable t={t} title={t("Самые продаваемые")} rows={r.products.top} />
          <GroupTable t={t} title={t("Наименее продаваемые")} rows={r.products.least} />
          <GroupTable t={t} title={t("Бонусные (расход по цене)")} rows={r.products.bonus} />
          <GroupTable t={t} title={t("Принудительные продажи")} rows={r.products.forced} />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">{t("Логистика")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile t={t} label="Доставки" value={r.logistics.deliveries} />
          <Tile t={t} label="Завершены полностью" value={r.logistics.completed} />
          <Tile t={t} label="Частично приняты" value={r.logistics.partial} />
          <Tile t={t} label="Не доставлены" value={r.logistics.notDelivered} />
          <Tile t={t} label="Отменены" value={r.logistics.cancelled} />
        </div>
        <Card className="overflow-x-auto p-0 sm:p-0">
          <h3 className="px-4 pt-3 text-sm font-semibold">{t("Показатели доставщиков")}</h3>
          {r.logistics.couriers.length === 0 ? <p className="px-4 py-3 text-sm text-gray-500">{t("Нет данных")}</p> : (
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-xs text-gray-500"><tr><th className="px-4 py-1 text-left">{t("Доставщик")}</th><th className="px-2 text-right">{t("Доставлено")}</th><th className="px-2 text-right">{t("Частично")}</th><th className="px-2 text-right">{t("Не доставлено")}</th><th className="px-4 text-right">{t("Собрано денег")}</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {r.logistics.couriers.map((c) => (
                  <tr key={c.name}><td className="px-4 py-1.5">{c.name}</td><td className="px-2 text-right">{c.delivered}</td><td className="px-2 text-right">{c.partial}</td><td className="px-2 text-right">{c.notDelivered}</td><td className="px-4 text-right">{t.money(c.collected)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">{t("Замены")} · {r.replacements.count}</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <GroupTable t={t} title={t("По причинам")} rows={r.replacements.byReason} money={false} count="заяв." />
          <GroupTable t={t} title={t("По товарам")} rows={r.replacements.byProduct} money={false} count="заяв." />
          <GroupTable t={t} title={t("По магазинам")} rows={r.replacements.byShop} money={false} count="заяв." />
          <GroupTable t={t} title={t("По статусам")} rows={r.replacements.byStatus} money={false} count="заяв." keyLabel={(k) => t(REPLACEMENT_STATUS_LABEL[k as keyof typeof REPLACEMENT_STATUS_LABEL] ?? k)} />
        </div>
      </section>
    </div>
  );
}

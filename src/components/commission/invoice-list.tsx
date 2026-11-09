import type { ReactNode } from "react";
import { Badge, Card } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { INVOICE_STATUS_COLOR, INVOICE_STATUS_LABEL } from "@/lib/commission-invoices";

type Row = {
  id: string;
  number: number;
  period: Date;
  orders: number;
  turnover: { toString(): string };
  amount: { toString(): string };
  dueDate: Date;
  status: keyof typeof INVOICE_STATUS_LABEL;
  paidAt: Date | null;
  supplier?: { displayName: string };
};

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

// А1: счета на комиссию платформы
export async function InvoiceList({ rows, action }: { rows: Row[]; action?: (row: Row) => ReactNode }) {
  const t = await getT();
  const today = new Date();
  return (
    <Card className="overflow-x-auto p-0 sm:p-0">
      <table className="stack-table w-full text-sm sm:min-w-[640px]">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-4 py-2 text-left">{t("Счёт")}</th>
            {rows.some((r) => r.supplier) && <th className="px-2 text-left">{t("Поставщик")}</th>}
            <th className="px-2 text-right">{t("Оборот")}</th>
            <th className="px-2 text-right">{t("Сумма")}</th>
            <th className="px-2 text-left">{t("Оплатить до")}</th>
            <th className="px-4 text-right">{t("Статус")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => {
            const overdue = r.status === "ISSUED" && r.dueDate < today;
            return (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-2 font-medium sm:font-normal">
                  №{r.number}
                  <span className="block text-xs text-gray-500">{t(MONTHS[r.period.getUTCMonth()])} {r.period.getUTCFullYear()} · {t("заказов: {n}", { n: r.orders })}</span>
                </td>
                {r.supplier && <td data-label={t("Поставщик")} className="px-2 py-2">{r.supplier.displayName}</td>}
                <td data-label={t("Оборот")} className="px-2 py-2 text-right whitespace-nowrap">{t.money(r.turnover)}</td>
                <td data-label={t("Сумма")} className="px-2 py-2 text-right font-medium whitespace-nowrap">{t.money(r.amount)}</td>
                <td data-label={t("Оплатить до")} className={overdue ? "px-2 py-2 font-medium text-red-600" : "px-2 py-2"}>{t.date(r.dueDate)}</td>
                <td data-label={t("Статус")} className="space-y-1 px-4 py-2 text-right">
                  <Badge color={overdue ? "red" : INVOICE_STATUS_COLOR[r.status]}>{overdue ? "Просрочен" : INVOICE_STATUS_LABEL[r.status]}</Badge>
                  {r.paidAt && <div className="text-xs text-gray-500">{t.date(r.paidAt)}</div>}
                  {r.status === "ISSUED" && action?.(r)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

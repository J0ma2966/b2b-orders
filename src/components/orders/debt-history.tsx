import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import { PAYMENT_LABEL } from "@/lib/order-core";
import { balanceLabel } from "./order-view";
import type { DebtEntryType, PaymentMethod } from "@/generated/prisma/enums";
import { getT } from "@/lib/i18n/server";

export const DEBT_TYPE_LABEL: Record<DebtEntryType, string> = {
  ORDER_CHARGE: "Заказ",
  ORDER_PAYMENT: "Оплата заказа",
  DEBT_PAYMENT: "Погашение",
  CORRECTION: "Корректировка",
};

type Entry = {
  id: string;
  type: DebtEntryType;
  amount: { toString(): string };
  balanceAfter: { toString(): string };
  paymentMethod: PaymentMethod | null;
  comment: string | null;
  occurredAt: Date;
  order: { id: string; number: number | null } | null;
  user?: { fullName: string } | null;
};

// Журнал задолженности (ТЗ п. 43)
export async function DebtHistory({ entries, orderHref }: { entries: Entry[]; orderHref: (id: string) => string }) {
  const t = await getT();
  if (entries.length === 0) return <EmptyState>{t("Операций пока нет")}</EmptyState>;
  return (
    <Card className="overflow-x-auto p-0 sm:p-0">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-3 py-2">{t("Дата")}</th><th className="px-3 py-2">{t("Операция")}</th><th className="px-3 py-2">{t("Заказ")}</th>
            <th className="px-3 py-2 text-right">{t("Сумма")}</th><th className="px-3 py-2 text-right">{t("Остаток")}</th><th className="px-3 py-2">{t("Кто, комментарий")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map((e) => {
            const amount = Number(e.amount);
            return (
              <tr key={e.id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap">{t.dateTime(e.occurredAt)}</td>
                <td className="px-3 py-2">{t(DEBT_TYPE_LABEL[e.type])}{e.paymentMethod && <div className="text-xs text-gray-500">{t(PAYMENT_LABEL[e.paymentMethod])}</div>}</td>
                <td className="px-3 py-2">{e.order ? <Link className="text-brand-600" href={orderHref(e.order.id)}>№{e.order.number}</Link> : "—"}</td>
                <td className={amount > 0 ? "px-3 py-2 text-right text-red-700" : "px-3 py-2 text-right text-green-700"}>{amount > 0 ? "+" : "−"}{t.money(Math.abs(amount))}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{balanceLabel(Number(e.balanceAfter), t)}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{e.user?.fullName}{e.comment && <div>{t(e.comment)}</div>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

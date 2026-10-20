import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/order-core";
import { balanceLabel } from "./order-view";
import type { DebtEntryType, PaymentMethod } from "@/generated/prisma/enums";

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
export function DebtHistory({ entries, orderHref }: { entries: Entry[]; orderHref: (id: string) => string }) {
  if (entries.length === 0) return <EmptyState>Операций пока нет</EmptyState>;
  return (
    <Card className="overflow-x-auto p-0 sm:p-0">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-3 py-2">Дата</th><th className="px-3 py-2">Операция</th><th className="px-3 py-2">Заказ</th>
            <th className="px-3 py-2 text-right">Сумма</th><th className="px-3 py-2 text-right">Остаток</th><th className="px-3 py-2">Кто, комментарий</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map((e) => {
            const amount = Number(e.amount);
            return (
              <tr key={e.id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(e.occurredAt)}</td>
                <td className="px-3 py-2">{DEBT_TYPE_LABEL[e.type]}{e.paymentMethod && <div className="text-xs text-gray-500">{PAYMENT_LABEL[e.paymentMethod]}</div>}</td>
                <td className="px-3 py-2">{e.order ? <Link className="text-brand-600" href={orderHref(e.order.id)}>№{e.order.number}</Link> : "—"}</td>
                <td className={amount > 0 ? "px-3 py-2 text-right text-red-700" : "px-3 py-2 text-right text-green-700"}>{amount > 0 ? "+" : "−"}{formatMoney(Math.abs(amount))}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{balanceLabel(Number(e.balanceAfter))}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{e.user?.fullName}{e.comment && <div>{e.comment}</div>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

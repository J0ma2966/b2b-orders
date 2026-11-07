import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, DefinitionList } from "@/components/ui";
import { formatQty } from "@/lib/catalog";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/core";
import { actorRoleText, ITEM_KIND_LABEL, PAYMENT_LABEL, lineTotal, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL, orderEventText } from "@/lib/order-core";
import type { OrderItemKind, OrderStatus } from "@/generated/prisma/enums";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge color={ORDER_STATUS_COLOR[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

type ItemView = {
  id: string;
  kind: OrderItemKind;
  productName: string;
  unitLabel: string;
  price: { toString(): string };
  qty: { toString(): string };
  deliveredQty?: { toString(): string } | null;
  acceptedQty?: { toString(): string } | null;
  bonusPromotion?: { name: string } | null;
};

const KIND_ORDER: OrderItemKind[] = ["REGULAR", "FORCED", "BONUS"];

// Позиции заказа: принудительные продажи и бонусы отдельными блоками с отметкой (ТЗ п. 23–24).
export async function OrderItems({ items, total, action }: { items: ItemView[]; total: { toString(): string }; action?: (item: ItemView) => ReactNode }) {
  const t = await getT();
  return (
    <Card className="p-0 sm:p-0">
      {KIND_ORDER.map((kind) => {
        const list = items.filter((i) => i.kind === kind);
        if (list.length === 0) return null;
        return (
          <div key={kind} className="border-b border-gray-100 last:border-0">
            {kind !== "REGULAR" && (
              <div className={kind === "FORCED" ? "bg-yellow-50 px-4 py-2 text-xs font-medium text-yellow-800" : "bg-green-50 px-4 py-2 text-xs font-medium text-green-800"}>
                {t(ITEM_KIND_LABEL[kind])}
              </div>
            )}
            <ul className="divide-y divide-gray-100">
              {list.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{i.productName}</div>
                    <div className="text-xs text-gray-500">
                      {formatQty(i.qty)} {t(i.unitLabel)}
                      {kind === "BONUS" ? ` · ${t("бесплатно")}${i.bonusPromotion ? ` · ${i.bonusPromotion.name}` : ""}` : ` × ${t.money(i.price)}`}
                    </div>
                    {i.acceptedQty != null && (
                      <div className={Number(i.acceptedQty) < Number(i.qty) ? "text-xs text-yellow-700" : "text-xs text-gray-500"}>
                        {t("доставлено {d} · принято {a}", { d: formatQty(i.deliveredQty ?? i.qty), a: formatQty(i.acceptedQty) })}
                        {Number(i.acceptedQty) < Number(i.qty) && ` · ${t("не принято {n}", { n: formatQty(Number(i.qty) - Number(i.acceptedQty)) })}`}
                      </div>
                    )}
                    {action?.(i)}
                  </div>
                  <div className="shrink-0 text-sm font-medium">{t.money(kind === "BONUS" ? 0 : lineTotal(Number(i.price), Number(i.acceptedQty ?? i.qty)))}</div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <div className="flex justify-between px-4 py-3 font-semibold">
        <span>{t("Итого")}</span>
        <span>{t.money(total)}</span>
      </div>
    </Card>
  );
}

type EventView = {
  id: string;
  type: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  data: unknown;
  comment: string | null;
  actorRole: string | null;
  createdAt: Date;
  user?: { fullName: string } | null;
};

export async function OrderHistory({ events }: { events: EventView[] }) {
  const t = await getT();
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="border-l-2 border-gray-200 pl-3">
          <div className="text-sm font-medium">{t(orderEventText(e))}</div>
          {e.comment && <div className="text-sm whitespace-pre-line text-gray-700">{t(e.comment)}</div>}
          <div className="text-xs text-gray-500">
            {t.dateTime(e.createdAt)}
            {e.user && ` · ${t.person(e.user.fullName)}`}
            {e.actorRole && ` (${t(actorRoleText(e.actorRole))})`}
          </div>
        </li>
      ))}
    </ol>
  );
}

type OrderRow = {
  id: string;
  number: number | null;
  status: OrderStatus;
  total: { toString(): string };
  placedAt: Date | null;
  deliveryDate?: Date | null;
};

// Список заказов для любой роли; party — кого показать в строке (магазин или поставщик).
// selectForm — id формы массовых действий (П3): у каждой строки появляется галочка
export async function OrdersList<R extends OrderRow>({
  rows,
  href,
  party,
  extra,
  selectForm,
}: {
  rows: R[];
  href: (id: string) => string;
  party: (row: R) => ReactNode;
  extra?: (row: R) => ReactNode;
  selectForm?: string;
}) {
  const t = await getT();
  return (
    <Card className="overflow-hidden p-0!">
      <ul className="divide-y divide-gray-100">
        {rows.map((o) => (
          <li key={o.id} className="flex items-stretch">
            {selectForm && (
              <label className="hidden shrink-0 cursor-pointer items-center pl-4 sm:flex">
                <input type="checkbox" form={selectForm} name="ids[]" value={o.id} className="size-4" aria-label={t("Заказ №{n}", { n: o.number })} />
              </label>
            )}
            <Link href={href(o.id)} className="flex min-w-0 flex-1 items-start justify-between gap-3 px-4 py-3 hover:bg-gray-50">
              <div className="min-w-0 flex-1">
                <div className="font-medium">№{o.number} · {party(o)}</div>
                <div className="text-xs text-gray-500">
                  {t.dateTime(o.placedAt)} · {t.money(o.total)}
                </div>
                {extra?.(o)}
              </div>
              <span className="shrink-0"><OrderStatusBadge status={o.status} /></span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

type FinanceView = {
  status: OrderStatus;
  total: { toString(): string };
  orderedTotal: { toString(): string } | null;
  correctionTotal: { toString(): string };
  receivedAmount: { toString(): string } | null;
  receivedMethod: keyof typeof PAYMENT_LABEL | null;
  paidToOrder: { toString(): string } | null;
  paidToDebt: { toString(): string } | null;
  overpaid: { toString(): string } | null;
  orderDebt: { toString(): string } | null;
  balanceBefore: { toString(): string } | null;
  balanceAfter: { toString(): string } | null;
  qrUsedAt: Date | null;
};

// Финансы заказа (ТЗ п. 76): первоначальная и итоговая сумма, оплата, долги.
export async function OrderFinance({ o, currentBalance }: { o: FinanceView; currentBalance?: number }) {
  if (o.receivedAmount === null) return null;
  const t = await getT();
  const formatMoney = t.money;
  const correction = Number(o.correctionTotal);
  const rows: [string, ReactNode][] = [
    ["Первоначальная сумма", formatMoney(o.orderedTotal)],
    ["Итоговая сумма (по принятому)", formatMoney(o.total)],
    ...(correction !== 0 ? [["Корректировки", `${correction > 0 ? "+" : ""}${formatMoney(correction)}`] as [string, ReactNode]] : []),
    ["Получено", `${formatMoney(o.receivedAmount)}${o.receivedMethod ? ` · ${t(PAYMENT_LABEL[o.receivedMethod])}` : ""}`],
    ["Оплачено по заказу", formatMoney(o.paidToOrder)],
    ...(Number(o.paidToDebt) > 0 ? [["Погашено прежнего долга", formatMoney(o.paidToDebt)] as [string, ReactNode]] : []),
    ...(Number(o.overpaid) > 0 ? [["Переплата", formatMoney(o.overpaid)] as [string, ReactNode]] : []),
    ["Долг по заказу", formatMoney(o.orderDebt)],
    ["Предыдущий долг", balanceLabel(Number(o.balanceBefore), t)],
    ["Задолженность после заказа", balanceLabel(Number(o.balanceAfter), t)],
    ...(currentBalance !== undefined ? [["Задолженность сейчас", balanceLabel(currentBalance, t)] as [string, ReactNode]] : []),
    ["Получение подтверждено", o.qrUsedAt ? t("по QR, {date}", { date: t.dateTime(o.qrUsedAt) }) : "—"],
  ];
  return (
    <Card>
      <h2 className="mb-2 font-semibold">{t("Финансы")}</h2>
      <DefinitionList items={rows} />
    </Card>
  );
}

export function balanceLabel(b: number, t: T) {
  if (b > 0) return t("долг {sum}", { sum: t.money(b) });
  if (b < 0) return t("переплата {sum}", { sum: t.money(-b) });
  return t("нет");
}

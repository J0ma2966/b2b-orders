import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card } from "@/components/ui";
import { formatQty } from "@/lib/catalog";
import { formatDateTime, formatMoney } from "@/lib/format";
import { actorRoleText, ITEM_KIND_LABEL, lineTotal, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL, orderEventText } from "@/lib/order-core";
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
  bonusPromotion?: { name: string } | null;
};

const KIND_ORDER: OrderItemKind[] = ["REGULAR", "FORCED", "BONUS"];

// Позиции заказа: принудительные продажи и бонусы отдельными блоками с отметкой (ТЗ п. 23–24).
export function OrderItems({ items, total, action }: { items: ItemView[]; total: { toString(): string }; action?: (item: ItemView) => ReactNode }) {
  return (
    <Card className="p-0 sm:p-0">
      {KIND_ORDER.map((kind) => {
        const list = items.filter((i) => i.kind === kind);
        if (list.length === 0) return null;
        return (
          <div key={kind} className="border-b border-gray-100 last:border-0">
            {kind !== "REGULAR" && (
              <div className={kind === "FORCED" ? "bg-yellow-50 px-4 py-2 text-xs font-medium text-yellow-800" : "bg-green-50 px-4 py-2 text-xs font-medium text-green-800"}>
                {ITEM_KIND_LABEL[kind]}
              </div>
            )}
            <ul className="divide-y divide-gray-100">
              {list.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{i.productName}</div>
                    <div className="text-xs text-gray-500">
                      {formatQty(i.qty)} {i.unitLabel}
                      {kind === "BONUS" ? ` · бесплатно${i.bonusPromotion ? ` · ${i.bonusPromotion.name}` : ""}` : ` × ${formatMoney(i.price)}`}
                    </div>
                    {action?.(i)}
                  </div>
                  <div className="shrink-0 text-sm font-medium">{formatMoney(kind === "BONUS" ? 0 : lineTotal(Number(i.price), Number(i.qty)))}</div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <div className="flex justify-between px-4 py-3 font-semibold">
        <span>Итого</span>
        <span>{formatMoney(total)}</span>
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

export function OrderHistory({ events }: { events: EventView[] }) {
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="border-l-2 border-gray-200 pl-3">
          <div className="text-sm font-medium">{orderEventText(e)}</div>
          {e.comment && <div className="text-sm whitespace-pre-line text-gray-700">{e.comment}</div>}
          <div className="text-xs text-gray-500">
            {formatDateTime(e.createdAt)}
            {e.user && ` · ${e.user.fullName}`}
            {e.actorRole && ` (${actorRoleText(e.actorRole)})`}
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
export function OrdersList<T extends OrderRow>({ rows, href, party }: { rows: T[]; href: (id: string) => string; party: (row: T) => ReactNode }) {
  return (
    <Card className="p-0 sm:p-0">
      <ul className="divide-y divide-gray-100">
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={href(o.id)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50">
              <div className="min-w-0">
                <div className="font-medium">№{o.number} · {party(o)}</div>
                <div className="text-xs text-gray-500">
                  {formatDateTime(o.placedAt)} · {formatMoney(o.total)}
                </div>
              </div>
              <OrderStatusBadge status={o.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

import Link from "next/link";
import { cn } from "@/components/ui";
import { db } from "@/lib/db";
import { ORDER_CHANGED, ORDER_STATUS_LABEL } from "@/lib/order-core";
import { getT } from "@/lib/i18n/server";
import type { OrderStatus } from "@/generated/prisma/enums";

// Путь заказа магазина: где он сейчас между оформлением и получением
const STEPS = ["Оформлен", "Принят", "Собирается", "В пути", "Получен"] as const;

const STEP_OF: Partial<Record<OrderStatus, number>> = {
  PLACED: 0,
  ACCEPTED: 1,
  ASSEMBLING: 2,
  READY: 2,
  ASSIGNED: 2,
  IN_TRANSIT: 3,
  DELIVERY_PROBLEM: 3,
  NEEDS_CONFIRMATION: 3,
  DELIVERED: 4,
  COMPLETED: 4,
  PARTIALLY_ACCEPTED: 4,
};

export const isTracked = (status: OrderStatus) => STEP_OF[status] !== undefined;

const TROUBLE: OrderStatus[] = ["DELIVERY_PROBLEM", "NEEDS_CONFIRMATION"];

export async function OrderTracker({ status, compact = false }: { status: OrderStatus; compact?: boolean }) {
  const t = await getT();
  const current = STEP_OF[status];
  if (current === undefined) return null;
  const trouble = TROUBLE.includes(status);
  return (
    <ol className="grid grid-cols-5" aria-label={t("Статус заказа")}>
      {STEPS.map((label, i) => {
        const done = i < current || (i === current && current === STEPS.length - 1);
        const now = i === current && !done;
        return (
          <li key={label} className="relative flex flex-col items-center text-center" aria-current={now ? "step" : undefined}>
            {i > 0 && <span className={cn("absolute right-1/2 h-1 w-full", compact ? "top-1" : "top-2.5", i <= current ? "bg-brand-600" : "bg-gray-200")} aria-hidden />}
            <span
              className={cn(
                "relative z-10 grid shrink-0 place-items-center rounded-full font-bold",
                compact ? "size-3" : "size-6 text-[11px]",
                done && "bg-brand-600 text-on-brand",
                now && (trouble ? "bg-red-600 text-white ring-4 ring-red-100" : "bg-accent text-on-accent ring-4 ring-accent/25"),
                !done && !now && "bg-gray-200 text-gray-500",
              )}
            >
              {!compact && (done ? "✓" : i + 1)}
            </span>
            {!compact && (
              <span className={cn("mt-1.5 px-0.5 text-[11px] leading-tight sm:text-xs", now ? "font-semibold text-ink" : "text-gray-500")}>
                {now && trouble ? t(ORDER_STATUS_LABEL[status]) : t(label)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

type TrackRow = { id: string; number: number | null; status: OrderStatus; placedAt: Date | null; total: { toString(): string }; supplier: { displayName: string } };

// Непрочитанные уведомления пользователя по заказам: «Изменён» (поставщик поменял состав) или «Обновлён» (новый статус).
// Гаснут, когда пользователь открывает заказ (SeenTracker).
async function orderMarks(userId: string, orderIds: string[]) {
  const notes = await db.notification.findMany({
    where: { userId, readAt: null, entity: "Order", entityId: { in: orderIds } },
    select: { entityId: true, type: true },
  });
  const marks = new Map<string, "changed" | "updated">();
  for (const n of notes) {
    if (n.type === ORDER_CHANGED) marks.set(n.entityId!, "changed");
    else if (!marks.has(n.entityId!)) marks.set(n.entityId!, "updated");
  }
  return marks;
}

// Заказы магазина: карточка с поставщиком, суммой и путём заказа
export async function ShopOrderCards({ rows, userId }: { rows: TrackRow[]; userId: string }) {
  const [t, marks] = await Promise.all([getT(), orderMarks(userId, rows.map((r) => r.id))]);
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {rows.map((o) => {
        const mark = marks.get(o.id);
        return (
        <li key={o.id}>
          <Link
            href={`/shop/orders/${o.id}`}
            className={cn("block rounded-2xl bg-surface p-4 ring-1 hover:ring-brand-500", mark === "changed" ? "ring-2 ring-yellow-400" : "ring-black/5")}
          >
            {mark && (
              <div
                data-testid={mark === "changed" ? "order-changed" : "order-updated"}
                className={cn(
                  "mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  mark === "changed" ? "bg-yellow-100 text-yellow-800" : "bg-brand-50 text-brand-700",
                )}
              >
                <span className={cn("size-2 rounded-full", mark === "changed" ? "bg-yellow-500" : "bg-brand-600")} aria-hidden />
                {t(mark === "changed" ? "Изменён поставщиком" : "Есть обновления")}
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{o.supplier.displayName}</div>
                <div className="text-xs text-gray-500">
                  №{o.number} · {t.dateTime(o.placedAt)}
                </div>
              </div>
              <div className="shrink-0 text-right font-bold tabular-nums">{t.money(o.total)}</div>
            </div>
            <div className="mt-4">
              {STEP_OF[o.status] !== undefined ? (
                <OrderTracker status={o.status} />
              ) : (
                <span className="text-sm text-gray-500">{t(ORDER_STATUS_LABEL[o.status])}</span>
              )}
            </div>
          </Link>
        </li>
        );
      })}
    </ul>
  );
}

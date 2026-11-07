import Link from "next/link";
import { cn } from "@/components/ui";
import { FileText, Phone, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { ORDER_CHANGED, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "@/lib/order-core";
import { Avatar } from "./ui";

// Крупная дата в карточке заказа: «7 ноября» / «7-noyabr»
const DAY_MONTH = {
  ru: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Tashkent" }),
  uz: new Intl.DateTimeFormat("uz-Latn-UZ", { day: "numeric", month: "long", timeZone: "Asia/Tashkent" }),
};
const dayMonth = (locale: "ru" | "uz", d: Date | null) => (d ? DAY_MONTH[locale].format(d) : "");
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
export async function orderMarks(userId: string, orderIds: string[]) {
  const notes = await db.notification.findMany({
    where: { userId, readAt: null, entity: "Order", entityId: { in: orderIds } },
    select: { entityId: true, type: true },
  });
  const marks = new Map<string, Mark>();
  for (const n of notes) {
    if (n.type === ORDER_CHANGED) marks.set(n.entityId!, "changed");
    else if (!marks.has(n.entityId!)) marks.set(n.entityId!, "updated");
  }
  return marks;
}

type Mark = "changed" | "updated";

// Метка на карточке заказа: «Изменён поставщиком» (жёлтая) или «Есть обновления»
async function OrderMark({ mark, dark }: { mark?: Mark; dark?: boolean }) {
  if (!mark) return null;
  const t = await getT();
  return (
    <span
      data-testid={mark === "changed" ? "order-changed" : "order-updated"}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold",
        mark === "changed" ? "bg-yellow-300 text-night" : dark ? "bg-white/10 text-lime" : "bg-brand-50 text-brand-700",
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", mark === "changed" ? "bg-night" : dark ? "bg-lime" : "bg-brand-700")} aria-hidden />
      <span className="truncate">{t(mark === "changed" ? "Изменён поставщиком" : "Есть обновления")}</span>
    </span>
  );
}

// ── Макет «Заказы»: тёмная карточка заказа в работе и белые строки остальных ──
const BAR_STEPS = ["Оформлен", "Принят", "В пути", "Получен"] as const;
const BAR_OF: Partial<Record<OrderStatus, number>> = {
  PLACED: 0,
  ACCEPTED: 1,
  ASSEMBLING: 1,
  READY: 1,
  ASSIGNED: 1,
  IN_TRANSIT: 2,
  DELIVERY_PROBLEM: 2,
  NEEDS_CONFIRMATION: 2,
  DELIVERED: 3,
  COMPLETED: 3,
  PARTIALLY_ACCEPTED: 3,
};

type HeroOrder = TrackRow & { deliveryDate: Date | null; supplier: { displayName: string; phone: string }; _count: { items: number } };

export async function ActiveOrderCard({ o, mark }: { o: HeroOrder; mark?: Mark }) {
  const t = await getT();
  const step = BAR_OF[o.status] ?? 0;
  const trouble = TROUBLE.includes(o.status);
  return (
    <section className={cn("relative overflow-hidden rounded-[2rem] bg-night p-5 text-white", mark === "changed" && "ring-4 ring-yellow-300")}>
      <span aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-white/[0.05]" />
      <div className="relative flex items-start justify-between gap-3">
        <Link href={`/shop/orders/${o.id}`} className="min-w-0">
          {mark && (
            <div className="mb-2">
              <OrderMark mark={mark} dark />
            </div>
          )}
          <div className="truncate text-sm text-white/60">№ {o.number} · {o.supplier.displayName}</div>
          <div className="mt-0.5 font-semibold tabular-nums">
            {t("{n} позиций", { n: o._count.items })} · {t.money(o.total)}
          </div>
        </Link>
        <span className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold", trouble ? "bg-coral text-white" : "bg-lime text-night")}>
          <Truck className="size-4" aria-hidden />
          {t(ORDER_STATUS_LABEL[o.status])}
        </span>
      </div>
      <div className="relative mt-4 text-sm text-white/60">{o.deliveryDate ? t("Дата доставки") : t("Оформлен")}</div>
      <div className="relative font-display text-[2.4rem] leading-none font-bold tracking-tight whitespace-nowrap text-lime">{dayMonth(t.locale, o.deliveryDate ?? o.placedAt)}</div>
      <ol className="relative mt-5 grid grid-cols-4 gap-1.5" aria-label={t("Статус заказа")}>
        {BAR_STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            <span className={cn("progress-fill block h-2 rounded-full", i <= step ? (trouble && i === step ? "bg-coral" : "bg-lime") : "bg-white/15")} />
            <span className={cn("mt-2 block truncate text-xs", i === step ? "font-bold text-white" : "text-white/55")}>{t(label)}</span>
          </li>
        ))}
      </ol>
      <div className="relative mt-5 grid grid-cols-2 gap-2.5">
        <a href={`tel:${o.supplier.phone}`} className="flex h-14 min-w-0 items-center justify-center gap-2 rounded-[1.25rem] bg-lime px-3 font-bold text-night">
          <Phone className="size-5 shrink-0" aria-hidden />
          <span className="truncate">{t("Позвонить")}</span>
        </a>
        <Link href={`/shop/orders/${o.id}`} className="flex h-14 min-w-0 items-center justify-center gap-2 rounded-[1.25rem] px-3 font-bold ring-1 ring-white/25">
          <FileText className="size-5 shrink-0" aria-hidden />
          <span className="truncate">{t("Открыть")}</span>
        </Link>
      </div>
    </section>
  );
}

export async function OrderRows({ rows, marks }: { rows: TrackRow[]; marks: Map<string, Mark> }) {
  const t = await getT();
  return (
    <ul className="space-y-2.5">
      {rows.map((o) => {
        const mark = marks.get(o.id);
        return (
          <li key={o.id}>
            <Link href={`/shop/orders/${o.id}`} className={cn("flex items-center gap-3 rounded-[1.5rem] bg-surface p-3.5", mark === "changed" && "ring-2 ring-yellow-400")}>
              <Avatar name={o.supplier.displayName} className="size-14 text-base" />
              <span className="min-w-0 flex-1">
                {mark && <OrderMark mark={mark} />}
                <span className="block truncate font-display text-[17px] leading-tight font-bold">{o.supplier.displayName}</span>
                <span className="block truncate text-sm text-gray-500 tabular-nums">№ {o.number} · {t.money(o.total)}</span>
              </span>
              <StatusChip status={o.status} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const CHIP: Record<string, string> = {
  green: "bg-brand-50 text-brand-700",
  yellow: "bg-coral-soft text-red-900",
  red: "bg-red-100 text-red-800",
  blue: "bg-tile-blue/50 text-night",
  gray: "bg-page text-gray-600",
};

export async function StatusChip({ status }: { status: OrderStatus }) {
  const t = await getT();
  return <span className={cn("max-w-32 shrink-0 truncate rounded-full px-3 py-1.5 text-xs font-bold", CHIP[ORDER_STATUS_COLOR[status]] ?? CHIP.gray)}>{t(ORDER_STATUS_LABEL[status])}</span>;
}

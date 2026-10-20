// Правила заказа без БД (покрыто тестами). ТЗ п. 21–28, 50–51.
import type { OrderItemKind, OrderStatus, PaymentMethod, UnitKind } from "@/generated/prisma/enums";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Черновик",
  PLACED: "Оформлен",
  ACCEPTED: "Принят поставщиком",
  ASSEMBLING: "Собирается",
  READY: "Готов к доставке",
  ASSIGNED: "Назначен доставщику",
  IN_TRANSIT: "В пути",
  DELIVERED: "Доставлен",
  COMPLETED: "Завершён",
  CANCELLED_BY_SHOP: "Отменён магазином",
  CANCELLED_BY_SUPPLIER: "Отменён поставщиком",
  REJECTED: "Отклонён поставщиком",
  NOT_DELIVERED: "Не доставлен",
  PARTIALLY_ACCEPTED: "Частично принят",
  NEEDS_CONFIRMATION: "Требует подтверждения",
  DELIVERY_PROBLEM: "Проблема при доставке",
};

export const ORDER_STATUS_COLOR = {
  DRAFT: "gray",
  PLACED: "blue",
  ACCEPTED: "blue",
  ASSEMBLING: "yellow",
  READY: "yellow",
  ASSIGNED: "yellow",
  IN_TRANSIT: "yellow",
  DELIVERED: "green",
  COMPLETED: "green",
  CANCELLED_BY_SHOP: "red",
  CANCELLED_BY_SUPPLIER: "red",
  REJECTED: "red",
  NOT_DELIVERED: "red",
  PARTIALLY_ACCEPTED: "yellow",
  NEEDS_CONFIRMATION: "yellow",
  DELIVERY_PROBLEM: "red",
} as const satisfies Record<OrderStatus, string>;

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: "Наличные",
  CARD: "Карта",
  TRANSFER: "Безналичный расчёт",
};

export const ITEM_KIND_LABEL: Record<OrderItemKind, string> = {
  REGULAR: "Обычная продажа",
  FORCED: "Принудительная продажа",
  BONUS: "Бонус",
};

// Заказ оформлен, но ещё не у доставщика в пути: резерв держится, магазин может отменить сам.
export const PRE_DELIVERY: OrderStatus[] = ["PLACED", "ACCEPTED", "ASSEMBLING", "READY", "ASSIGNED"];

// Закрытые состояния: резерва нет, действий нет.
export const CLOSED: OrderStatus[] = ["COMPLETED", "CANCELLED_BY_SHOP", "CANCELLED_BY_SUPPLIER", "REJECTED"];

// Действия поставщика по основному циклу (ТЗ п. 26).
export type SupplierOrderAction = "accept" | "assemble" | "ready" | "reject" | "cancel";

const SUPPLIER_TRANSITIONS: Record<SupplierOrderAction, { from: OrderStatus[]; to: OrderStatus }> = {
  accept: { from: ["PLACED"], to: "ACCEPTED" },
  assemble: { from: ["ACCEPTED"], to: "ASSEMBLING" },
  ready: { from: ["ASSEMBLING"], to: "READY" },
  reject: { from: ["PLACED"], to: "REJECTED" },
  cancel: { from: ["ACCEPTED", "ASSEMBLING", "READY", "ASSIGNED"], to: "CANCELLED_BY_SUPPLIER" },
};

export const SUPPLIER_ACTION_LABEL: Record<SupplierOrderAction, string> = {
  accept: "Принять заказ",
  assemble: "Начать сборку",
  ready: "Готов к доставке",
  reject: "Отклонить",
  cancel: "Отменить заказ",
};

export const SUPPLIER_ACTION_NEEDS_REASON: SupplierOrderAction[] = ["reject", "cancel"];

export function supplierOrderTransition(action: SupplierOrderAction, from: OrderStatus): OrderStatus | null {
  const t = SUPPLIER_TRANSITIONS[action];
  return t.from.includes(from) ? t.to : null;
}

export function availableSupplierOrderActions(from: OrderStatus): SupplierOrderAction[] {
  return (Object.keys(SUPPLIER_TRANSITIONS) as SupplierOrderAction[]).filter((a) => SUPPLIER_TRANSITIONS[a].from.includes(from));
}

// Магазин отменяет сам до начала доставки; после — только через запрос поставщику (ТЗ п. 28).
export function shopCanCancel(status: OrderStatus) {
  return PRE_DELIVERY.includes(status);
}

// Доставщика назначают на готовый заказ; переназначить можно, пока заказ не в пути (ТЗ п. 29).
export function canAssignCourier(status: OrderStatus) {
  return status === "READY" || status === "ASSIGNED";
}

// Принудительную продажу можно добавить до передачи доставщику (ТЗ п. 24).
export function canEditForced(status: OrderStatus) {
  return ["PLACED", "ACCEPTED", "ASSEMBLING", "READY"].includes(status);
}

// Дробное количество — только для весовых и объёмных единиц.
export function allowsFraction(kind: UnitKind) {
  return kind === "KG" || kind === "LITER";
}

export function validQty(kind: UnitKind, qty: number) {
  if (!Number.isFinite(qty) || qty <= 0) return false;
  if (allowsFraction(kind)) return Math.round(qty * 1000) === qty * 1000;
  return Number.isInteger(qty);
}

export function lineTotal(price: number, qty: number) {
  return Math.round(price * qty * 100) / 100;
}

// Стоимость заказа: бонусы бесплатны (ТЗ п. 51, 68).
export function orderTotal(items: { kind: OrderItemKind; price: number; qty: number }[]) {
  return Math.round(items.reduce((s, i) => s + (i.kind === "BONUS" ? 0 : lineTotal(i.price, i.qty)), 0) * 100) / 100;
}

export type Promotion = {
  id: string;
  triggerUnitId: string;
  triggerQty: number;
  giftUnitId: string;
  giftQty: number;
  repeatable: boolean;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
};

// Сколько подарка положено по акции при заданном количестве основного товара.
export function bonusEntitlement(p: Promotion, boughtQty: number, now: Date) {
  if (!p.isActive || now < p.startsAt || now > p.endsAt) return 0;
  if (p.triggerQty <= 0 || boughtQty < p.triggerQty) return 0;
  const times = p.repeatable ? Math.floor(boughtQty / p.triggerQty + 1e-9) : 1;
  return times * p.giftQty;
}

// Подарки по всем акциям с учётом остатка: сверх доступного не выдаётся (ТЗ п. 51).
// available — доступный остаток подарочных единиц после резерва обычных позиций.
export function planBonuses(
  promotions: Promotion[],
  bought: Map<string, number>,
  available: Map<string, number>,
  now: Date,
) {
  const left = new Map(available);
  const plan: { promotionId: string; giftUnitId: string; qty: number; entitled: number }[] = [];
  for (const p of promotions) {
    const entitled = bonusEntitlement(p, bought.get(p.triggerUnitId) ?? 0, now);
    if (entitled <= 0) continue;
    const free = Math.max(0, left.get(p.giftUnitId) ?? 0);
    // Подарок выдаётся целыми порциями акции
    const portions = Math.floor(Math.min(entitled, free) / p.giftQty + 1e-9);
    const qty = portions * p.giftQty;
    left.set(p.giftUnitId, free - qty);
    plan.push({ promotionId: p.id, giftUnitId: p.giftUnitId, qty, entitled });
  }
  return plan;
}

// Строка истории заказа (ТЗ п. 27).
export function orderEventText(e: { type: string; fromStatus: OrderStatus | null; toStatus: OrderStatus | null; data: unknown }) {
  const d = (e.data ?? {}) as Record<string, string | number | null>;
  const line = () => `${d.name} — ${d.qty} ${d.unit}`;
  switch (e.type) {
    case "status":
      return e.fromStatus === "DRAFT" ? "Заказ оформлен" : `Статус: ${ORDER_STATUS_LABEL[e.toStatus!]}`;
    case "courier.assigned":
      return d.previousCourierId ? `Доставщик заменён: ${d.courierName}` : `Назначен доставщик: ${d.courierName}`;
    case "courier.unassigned":
      return "Доставщик снят с заказа";
    case "item.forced_added":
      return `Добавлена принудительная продажа: ${line()}`;
    case "item.forced_removed":
      return `Убрана принудительная продажа: ${line()}`;
    default:
      return e.type;
  }
}

export const ACTOR_ROLE_LABEL: Record<string, string> = {
  SHOP: "магазин",
  SUPPLIER_OWNER: "владелец поставщика",
  SUPPLIER_ADMIN: "администратор поставщика",
  COURIER: "доставщик",
  SUPER_ADMIN: "супер-администратор",
};

export function actorRoleText(role: string | null) {
  if (!role) return "";
  const [a, b] = role.split("→");
  return b ? `${ACTOR_ROLE_LABEL.SUPER_ADMIN} от имени: ${ACTOR_ROLE_LABEL[b] ?? b}` : (ACTOR_ROLE_LABEL[a] ?? a);
}

// Фильтр списков заказов: группы и отдельные статусы. Черновики (корзины) в списки не попадают.
export const ORDER_FILTERS: [string, string][] = [
  ["active", "В работе"],
  ["closed", "Закрытые"],
  ...(Object.entries(ORDER_STATUS_LABEL) as [OrderStatus, string][]).filter(([s]) => s !== "DRAFT"),
];

export function orderStatusFilter(value: string): { not: OrderStatus } | { in: OrderStatus[] } | OrderStatus {
  if (value === "active") return { in: (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).filter((s) => s !== "DRAFT" && !CLOSED.includes(s)) };
  if (value === "closed") return { in: CLOSED };
  if (value in ORDER_STATUS_LABEL && value !== "DRAFT") return value as OrderStatus;
  return { not: "DRAFT" };
}

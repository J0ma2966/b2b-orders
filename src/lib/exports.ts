import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ORDER_STATUS_LABEL, PAYMENT_LABEL } from "@/lib/order-core";
import { DEBT_TYPE_LABEL } from "@/components/orders/debt-history";
import { accountState } from "@/lib/accounts";
import { REPLACEMENT_STATUS_LABEL } from "@/lib/replacement-core";
import type { Report } from "@/lib/reports";
import type { T } from "@/lib/i18n/core";
import type { Cell, Sheet } from "@/lib/xlsx";

// П7: выгрузки в Excel. Заголовки — на языке интерфейса пользователя, суммы — числами.

const n = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()));
const MAX_ROWS = 20_000;

export async function ordersSheet(where: Prisma.OrderWhereInput, t: T, cols: { shop?: boolean; supplier?: boolean }): Promise<Sheet> {
  const rows = await db.order.findMany({
    where: { ...where, status: where.status ?? { not: "DRAFT" } },
    include: { shop: { select: { name: true, phone: true } }, supplier: { select: { displayName: true } }, courier: { select: { fullName: true } } },
    orderBy: { placedAt: "desc" },
    take: MAX_ROWS,
  });
  const head: Cell[] = [
    t("№"),
    t("Оформлен"),
    ...(cols.supplier ? [t("Поставщик")] : []),
    ...(cols.shop ? [t("Магазин"), t("Телефон")] : []),
    t("Статус"),
    t("Сумма"),
    t("Корректировка"),
    t("Получено"),
    t("В долг"),
    t("Оплата"),
    t("Дата доставки"),
    t("Доставщик"),
    t("Завершён"),
  ];
  return {
    name: t("Заказы"),
    rows: [
      head,
      ...rows.map((o): Cell[] => [
        o.number,
        o.placedAt,
        ...(cols.supplier ? [o.supplier.displayName] : []),
        ...(cols.shop ? [o.shop.name, o.shop.phone] : []),
        t(ORDER_STATUS_LABEL[o.status]),
        n(o.total),
        n(o.correctionTotal) || null,
        n(o.receivedAmount),
        n(o.orderDebt),
        o.paymentMethod ? t(PAYMENT_LABEL[o.paymentMethod]) : null,
        o.deliveryDate ? t.date(o.deliveryDate) : null,
        o.courier?.fullName,
        o.completedAt,
      ]),
    ],
  };
}

// Остатки по магазинам (для поставщика) или по поставщикам (для магазина) и журнал операций
export async function debtSheets(by: { supplierId: string } | { shopId: string }, t: T): Promise<Sheet[]> {
  const forSupplier = "supplierId" in by;
  const accounts = await db.shopAccount.findMany({
    where: by,
    include: { shop: { select: { name: true, phone: true } }, supplier: { select: { displayName: true } } },
    orderBy: { balance: "desc" },
  });
  const agings = await Promise.all(accounts.map(async (a) => (Number(a.balance) > 0 && a.paymentTermDays ? (await accountState(db, a.shopId, a.supplierId)).aging : null)));
  const entries = await db.debtEntry.findMany({
    where: { account: by },
    include: { account: { include: { shop: { select: { name: true } }, supplier: { select: { displayName: true } } } }, order: { select: { number: true } } },
    orderBy: { occurredAt: "desc" },
    take: MAX_ROWS,
  });
  return [
    {
      name: t("Задолженность"),
      rows: [
        [forSupplier ? t("Магазин") : t("Поставщик"), ...(forSupplier ? [t("Телефон")] : []), t("Долг (+) / предоплата (−)"), t("Кредит"), t("Лимит"), t("Срок оплаты, дней"), t("Просрочено"), t("Дней просрочки")],
        ...accounts.map((a, i): Cell[] => [
          forSupplier ? a.shop.name : a.supplier.displayName,
          ...(forSupplier ? [a.shop.phone] : []),
          n(a.balance),
          t(a.creditAllowed ? "да" : "нет"),
          n(a.creditLimit),
          a.paymentTermDays,
          agings[i]?.overdueAmount || null,
          agings[i]?.overdueDays || null,
        ]),
      ],
    },
    {
      name: t("Операции"),
      rows: [
        [t("Дата"), forSupplier ? t("Магазин") : t("Поставщик"), t("Операция"), t("Заказ"), t("Сумма"), t("Остаток после"), t("Способ"), t("Комментарий")],
        ...entries.map((e): Cell[] => [
          e.occurredAt,
          forSupplier ? e.account.shop.name : e.account.supplier.displayName,
          t(DEBT_TYPE_LABEL[e.type]),
          e.order ? e.order.number : null,
          n(e.amount),
          n(e.balanceAfter),
          e.paymentMethod ? t(PAYMENT_LABEL[e.paymentMethod]) : null,
          e.comment,
        ]),
      ],
    },
  ];
}

export function reportSheets(r: Report, t: T, admin: boolean): Sheet[] {
  const group = (name: string, keyTitle: string, rows: { key: string; amount: number; qty: number; count: number }[], qty = true): Sheet => ({
    name: t(name),
    rows: [[t(keyTitle), ...(qty ? [t("Количество")] : [t("Заказов")]), t("Сумма")], ...rows.map((g): Cell[] => [t(g.key), qty ? g.qty : g.count, Math.round(g.amount * 100) / 100])],
  });
  const f = r.finance;
  return [
    {
      name: t("Итоги"),
      rows: [
        [t("Показатель"), t("Значение")],
        [t("Оборот"), r.sales.turnover],
        [t("Заказов получено"), r.sales.orders],
        [t("Заказов оформлено"), r.sales.placed],
        [t("Оплачено"), f.paid],
        [t("Сформировано долга"), f.debtFormed],
        [t("Погашено долга"), f.repaid],
        [t("Корректировки"), f.corrections],
        [t("Текущий долг магазинов"), f.currentDebt],
        [t("Комиссия платформы"), f.commission],
        [t("Доставок"), r.logistics.deliveries],
        [t("Не доставлено"), r.logistics.notDelivered],
        [t("Отменено"), r.logistics.cancelled],
        [t("Заявок на замену"), r.replacements.count],
      ],
    },
    group("По товарам", "Товар", r.sales.byProduct),
    group("По категориям", "Категория", r.sales.byCategory),
    group("По магазинам", "Магазин", r.sales.byShop, false),
    ...(admin ? [group("По поставщикам", "Поставщик", r.sales.bySupplier, false)] : []),
    {
      name: t("Должники"),
      rows: [[t("Магазин"), ...(admin ? [t("Поставщик")] : []), t("Долг")], ...f.debtors.map((d): Cell[] => [d.shop, ...(admin ? [d.supplier] : []), d.balance])],
    },
    {
      name: t("Доставщики"),
      rows: [
        [t("Доставщик"), t("Доставлено"), t("Частично"), t("Не доставлено"), t("Получено денег")],
        ...r.logistics.couriers.map((c): Cell[] => [c.name, c.delivered, c.partial, c.notDelivered, c.collected]),
      ],
    },
    {
      name: t("Замены"),
      rows: [
        [t("Причина / статус"), t("Количество")],
        ...r.replacements.byReason.map((g): Cell[] => [t(g.key), g.qty]),
        ...r.replacements.byStatus.map((g): Cell[] => [t(REPLACEMENT_STATUS_LABEL[g.key as keyof typeof REPLACEMENT_STATUS_LABEL] ?? g.key), g.qty]),
      ],
    },
  ];
}

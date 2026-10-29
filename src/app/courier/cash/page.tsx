import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import { requireDeliverer } from "@/lib/auth/current";
import { cashOrdersSince, courierCash } from "@/lib/cash";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { HandoverRow } from "@/components/orders/cash";
import { handsOverCash } from "@/lib/supplier-roles";

// Д1: касса доставщика — наличные на руках и что сдано поставщику
export default async function CourierCashPage() {
  const [ctx, t] = await Promise.all([requireDeliverer(), getT()]);
  const cash = await courierCash(ctx.supplier.id, ctx.auth.user.id);
  // Владелец развозит сам: наличные сразу его, сдавать некому — показываем только собранное
  const handsOver = handsOverCash(ctx.membership.role);
  const [orders, handovers] = await Promise.all([
    cashOrdersSince(ctx.supplier.id, ctx.auth.user.id, handsOver ? (cash.lastHandover?.createdAt ?? null) : null),
    db.cashHandover.findMany({ where: { supplierId: ctx.supplier.id, courierId: ctx.auth.user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return (
    <>
      <Link href="/courier" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-ink">{t("← Все доставки")}</Link>
      <h1 className="mb-4 text-2xl font-bold">{t("Касса")}</h1>
      <div className="rounded-2xl bg-brand-600 p-5 text-on-brand">
        <div className="text-sm opacity-80">{handsOver ? t("Наличные на руках") : t("Наличными сегодня")}</div>
        <div className="mt-1 text-4xl font-bold tabular-nums">{t.money(handsOver ? cash.onHand : cash.today)}</div>
        <div className="mt-2 text-sm opacity-80">
          {t("Сегодня получено {sum} по {n} заказам", { sum: t.money(cash.today), n: cash.todayOrders })}
        </div>
      </div>
      {handsOver && <p className="mt-3 text-sm text-gray-500">{t("Сдайте наличные поставщику: он отметит принятую сумму, и она уйдёт из кассы.")}</p>}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-500">{cash.lastHandover && handsOver ? t("После последней сдачи") : t("Наличные заказы")}</h2>
        {orders.length === 0 ? (
          <EmptyState>{t("Наличных оплат пока нет")}</EmptyState>
        ) : (
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-gray-100">
              {orders.map((o) => (
                <li key={o.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
                  <span>№{o.number} · {o.shop.name}<span className="block text-xs text-gray-500">{t.dateTime(o.completedAt)}</span></span>
                  <b className="tabular-nums">{t.money(o.receivedAmount)}</b>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
      {handovers.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-500">{t("Сдано поставщику")}</h2>
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-gray-100">
              {handovers.map((h) => (
                <HandoverRow key={h.id} h={h} t={t} />
              ))}
            </ul>
          </Card>
        </section>
      )}
    </>
  );
}

import { EmptyState } from "@/components/ui";
import { DeliveryHero, DeliveryRow } from "@/components/orders/delivery-card";
import { db } from "@/lib/db";
import { requireDeliverer } from "@/lib/auth/current";
import { WarmPages } from "@/components/orders/offline-sync";
import { yandexRouteUrl } from "@/lib/order-core";
import { courierRoute } from "@/lib/route";
import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { Banknote, Map as MapIcon } from "lucide-react";
import { courierCash } from "@/lib/cash";
import { handsOverCash } from "@/lib/supplier-roles";
import { moveRouteAction, resetRouteAction } from "./actions";

const moveBtn = "grid size-9 place-items-center rounded-lg bg-gray-100 text-base text-ink hover:bg-gray-200 disabled:opacity-30";

// Мои доставки: сегодня и предстоящие (ТЗ п. 74). Сверху — та, которой доставщик занят сейчас,
// ниже — маршрут дня (Д2): ближайшая точка за ближайшей, порядок можно поменять вручную.
export default async function CourierHome() {
  const t = await getT();
  const ctx = await requireDeliverer();
  const { route, later } = await courierRoute(ctx.supplier.id, ctx.auth.user.id);
  const replacementsByShop = await db.replacement.groupBy({
    by: ["shopId"],
    where: { supplierId: ctx.supplier.id, courierId: ctx.auth.user.id, status: "ASSIGNED" },
    _count: true,
  });
  const repl = new Map(replacementsByShop.map((r) => [r.shopId, r._count]));
  const cash = await courierCash(ctx.supplier.id, ctx.auth.user.id);
  const handsOver = handsOverCash(ctx.membership.role);
  // В пути — первой, затем по маршруту
  const [current, ...queue] = route;
  const routeUrl = route.length > 1 ? yandexRouteUrl(route) : null;
  const manual = route.some((o) => o.routeOrder !== null);
  return (
    <>
      <WarmPages urls={[...route, ...later].map((o) => `/courier/orders/${o.id}`)} />
      <h1 className="mb-1 text-2xl font-bold">{t("Мои доставки")}</h1>
      <p className="mb-4 text-sm text-gray-500">
        {t("Сегодня")} · {route.length}
        {later.length > 0 && ` · ${t("Предстоящие")} · ${later.length}`}
      </p>
      <Link href="/courier/cash" className="mb-4 flex items-center justify-between rounded-2xl bg-surface px-4 py-3 ring-1 ring-gray-200">
        <span className="flex items-center gap-2.5 text-sm text-gray-500"><span className="grid size-8 place-items-center rounded-xl bg-green-50 text-green-700"><Banknote className="size-[18px]" aria-hidden /></span>{handsOver ? t("Наличные на руках") : t("Наличными сегодня")}</span>
        <b className="tabular-nums">{t.money(handsOver ? cash.onHand : cash.today)}</b>
      </Link>
      {route.length === 0 && later.length === 0 && <EmptyState>{t("Назначенных доставок пока нет")}</EmptyState>}
      {current && <DeliveryHero o={current} replacements={repl.get(current.shopId)} />}
      {queue.length > 0 && (
        <section className="mt-6 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-500">{t("Маршрут дня")}</h2>
            {manual && (
              <form action={resetRouteAction}>
                <button className="text-xs text-gray-500 underline">{t("Порядок по расстоянию")}</button>
              </form>
            )}
          </div>
          {routeUrl && (
            <a href={routeUrl} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gray-100 px-4 text-sm font-semibold text-ink hover:bg-gray-200">
              <MapIcon className="size-[18px]" aria-hidden />
              {t("Открыть весь маршрут в Яндекс Картах")}
            </a>
          )}
          {queue.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-sm font-bold text-gray-500 tabular-nums">{i + 2}</span>
              <div className="min-w-0 flex-1">
                <DeliveryRow o={o} />
              </div>
              <form action={moveRouteAction} className="flex shrink-0 flex-col gap-1">
                <input type="hidden" name="orderId" value={o.id} />
                <button name="dir" value="up" className={moveBtn} disabled={o.status !== "ASSIGNED" || (i === 0 ? current.status !== "ASSIGNED" : queue[i - 1].status !== "ASSIGNED")} aria-label={t("Раньше: {name}", { name: o.shop.name })}>↑</button>
                <button name="dir" value="down" className={moveBtn} disabled={i === queue.length - 1 || o.status !== "ASSIGNED"} aria-label={t("Позже: {name}", { name: o.shop.name })}>↓</button>
              </form>
            </div>
          ))}
        </section>
      )}
      {later.length > 0 && (
        <section className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-gray-500">{t("Предстоящие")}</h2>
          {later.map((o) => <DeliveryRow key={o.id} o={o} />)}
        </section>
      )}
    </>
  );
}

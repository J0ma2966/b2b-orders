import Link from "next/link";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";
import { SUPPLIER_ROLE_LABEL } from "@/lib/statuses";
import { delivererWhere } from "@/lib/supplier-roles";
import { DeliversToggle } from "../team/forms";

const ACTIVE = ["ASSIGNED", "IN_TRANSIT", "DELIVERY_PROBLEM"] as const;

// Доставка у поставщика: ИП без доставщиков развозит сам через то же приложение доставщика,
// а доставщики-сотрудники остаются по желанию.
export default async function SupplierDeliveryPage() {
  const [ctx, t] = await Promise.all([requireSupplier(["OWNER", "ADMIN"]), getT()]);
  const me = ctx.membership;
  const [ready, deliverers, mine, myReplacements] = await Promise.all([
    db.order.count({ where: { supplierId: ctx.supplier.id, status: "READY" } }),
    db.supplierMember.findMany({
      where: { supplierId: ctx.supplier.id, ...delivererWhere },
      include: { user: { include: { _count: { select: { courierOrders: { where: { supplierId: ctx.supplier.id, status: { in: [...ACTIVE] } } } } } } } },
      orderBy: { createdAt: "asc" },
    }),
    me.delivers ? db.order.groupBy({ by: ["status"], where: { supplierId: ctx.supplier.id, courierId: ctx.auth.user.id, status: { in: [...ACTIVE] } }, _count: true }) : [],
    me.delivers ? db.replacement.count({ where: { supplierId: ctx.supplier.id, courierId: ctx.auth.user.id, status: "ASSIGNED" } }) : 0,
  ]);
  const myCount = Object.fromEntries(mine.map((g) => [g.status, g._count])) as Record<string, number>;
  return (
    <>
      <PageHeader title="Доставка" subtitle={t("Развозите заказы сами или поручите доставщикам")} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-semibold">{t("Сам развожу заказы")}</h2>
          {me.delivers ? (
            <>
              <p className="text-sm text-gray-600">
                {t("Готовые заказы назначайте на себя, а в дороге работайте в приложении доставки: маршрут дня, звонок магазину, приёмка по QR, частичная приёмка, оплата и работа без сети.")}
              </p>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-gray-50 p-2"><dt className="text-xs text-gray-500">{t("Назначено мне")}</dt><dd className="text-xl font-semibold">{myCount.ASSIGNED ?? 0}</dd></div>
                <div className="rounded-lg bg-gray-50 p-2"><dt className="text-xs text-gray-500">{t("В пути")}</dt><dd className="text-xl font-semibold">{myCount.IN_TRANSIT ?? 0}</dd></div>
                <div className="rounded-lg bg-gray-50 p-2"><dt className="text-xs text-gray-500">{t("Замены")}</dt><dd className="text-xl font-semibold">{myReplacements}</dd></div>
              </dl>
              {(myCount.DELIVERY_PROBLEM ?? 0) > 0 && <p className="text-sm text-red-700">{t("Проблем с доставкой: {n}", { n: myCount.DELIVERY_PROBLEM })}</p>}
              <div className="flex flex-wrap items-start gap-2">
                <ButtonLink href="/courier">🚚 {t("Открыть приложение доставки")}</ButtonLink>
                <DeliversToggle memberId={me.id} delivers big className="flex flex-wrap gap-2" />
              </div>
              <p className="text-xs text-gray-500">{t("На телефоне откройте приложение доставки и добавьте его на главный экран: список доставок и приёмка работают и без сети.")}</p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                {t("Нет своих доставщиков? Включите — и вы появитесь в списке, кому назначать доставку, а у вас откроется приложение доставки.")}
              </p>
              <DeliversToggle memberId={me.id} delivers={false} big className="flex flex-wrap gap-2" />
            </>
          )}
        </Card>
        <Card className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">{t("Кто развозит")}</h2>
            <Link href="/supplier/team" className="text-sm text-brand-600">{t("Добавить доставщика →")}</Link>
          </div>
          {deliverers.length === 0 ? (
            <p className="text-sm text-gray-500">{t("Пока некому доставлять заказы: включите «Сам развожу заказы» или добавьте доставщика.")}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {deliverers.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>
                    {d.user.fullName}
                    {d.userId === ctx.auth.user.id && <span className="text-gray-500"> · {t("вы")}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge color={d.role === "COURIER" ? "blue" : "gray"}>{t(SUPPLIER_ROLE_LABEL[d.role])}</Badge>
                    <span className="text-gray-500">{t("в работе {n}", { n: d.user._count.courierOrders })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {ready > 0 && (
            <Link href="/supplier/orders?status=READY" className="block rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800 ring-1 ring-yellow-200">
              {t("Готовы к доставке и ждут назначения: {n} →", { n: ready })}
            </Link>
          )}
        </Card>
      </div>
    </>
  );
}

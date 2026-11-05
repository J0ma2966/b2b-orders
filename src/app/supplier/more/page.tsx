import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { logoutAction } from "@/app/(auth)/actions";
import { getT } from "@/lib/i18n/server";
import { formatPhone } from "@/lib/phone";
import { SUPPLIER_ROLE_LABEL } from "@/lib/statuses";
import { SUPPLIER_MORE_GROUPS, SUPPLIER_NAV } from "../nav";
import { SupplierSwitcher } from "../switcher";

const row = "flex min-h-12 items-center gap-3 px-4 py-3 text-[15px] hover:bg-gray-50";

// «Ещё» в приложении поставщика: все разделы кабинета, режим доставки и личные настройки
export default async function SupplierMorePage() {
  const [ctx, t] = await Promise.all([requireSupplier(["OWNER", "ADMIN"]), getT()]);
  const me = ctx.membership;
  const active = ctx.supplier.status === "ACTIVE";
  const mine = me.delivers && active
    ? await db.order.count({ where: { supplierId: ctx.supplier.id, courierId: ctx.auth.user.id, status: { in: ["ASSIGNED", "IN_TRANSIT"] } } })
    : 0;
  const byHref = new Map(SUPPLIER_NAV.map((i) => [i.href, i]));
  return (
    <>
      <PageHeader title="Ещё" />
      <div className="space-y-4">
        <Card className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-xl" aria-hidden>🏢</span>
          <div className="min-w-0">
            <div className="truncate font-semibold">{ctx.supplier.displayName}</div>
            <div className="truncate text-sm text-gray-500">
              {ctx.auth.user.fullName} · {t(SUPPLIER_ROLE_LABEL[me.role])} · {formatPhone(ctx.auth.user.phone)}
            </div>
          </div>
        </Card>
        {/* Работает у нескольких поставщиков — переключатель (на компьютере он в шапке) */}
        {ctx.memberships.length > 1 && <SupplierSwitcher />}

        {active && (me.delivers ? (
          <Link href="/courier" className="flex items-center gap-3 rounded-xl bg-brand-600 p-4 text-on-brand shadow-sm" data-testid="delivery-mode">
            <span className="text-2xl" aria-hidden>🚚</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{t("Режим доставки")}</span>
              <span className="block text-sm opacity-85">{t("Маршрут, приёмка по QR, оплата, работа без сети")}</span>
            </span>
            {mine > 0 && <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-sm font-bold text-brand-700">{mine}</span>}
          </Link>
        ) : (
          <Link href="/supplier/delivery" className="flex items-center gap-3 rounded-xl bg-surface p-4 ring-1 ring-gray-200">
            <span className="text-2xl" aria-hidden>🚚</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{t("Сам развожу заказы")}</span>
              <span className="block text-sm text-gray-500">{t("Включите, чтобы доставлять заказы из этого же приложения")}</span>
            </span>
            <span className="text-gray-400" aria-hidden>›</span>
          </Link>
        ))}

        {SUPPLIER_MORE_GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-1.5 px-1 text-xs font-medium tracking-wide text-gray-500 uppercase">{t(g.title)}</h2>
            <Card className="divide-y divide-gray-100 overflow-hidden p-0!">
              {g.items.map((href) => {
                const i = byHref.get(href)!;
                return (
                  <Link key={href} href={href} className={row}>
                    <span className="w-6 text-center" aria-hidden>{i.icon}</span>
                    <span className="flex-1">{t(i.label)}</span>
                    <span className="text-gray-400" aria-hidden>›</span>
                  </Link>
                );
              })}
            </Card>
          </section>
        ))}

        <section>
          <h2 className="mb-1.5 px-1 text-xs font-medium tracking-wide text-gray-500 uppercase">{t("Мой профиль")}</h2>
          <Card className="divide-y divide-gray-100 overflow-hidden p-0!">
            <Link href="/account" className={row}><span className="w-6 text-center" aria-hidden>👤</span><span className="flex-1">{t("Профиль, пароль, уведомления")}</span><span className="text-gray-400" aria-hidden>›</span></Link>
            <Link href="/notifications" className={row}><span className="w-6 text-center" aria-hidden>🔔</span><span className="flex-1">{t("Уведомления")}</span><span className="text-gray-400" aria-hidden>›</span></Link>
            <Link href="/privacy" className={row}><span className="w-6 text-center" aria-hidden>🔒</span><span className="flex-1">{t("Политика конфиденциальности")}</span><span className="text-gray-400" aria-hidden>›</span></Link>
            <form action={logoutAction}>
              <button className={`${row} w-full text-left text-red-600`}><span className="w-6 text-center" aria-hidden>⏻</span><span className="flex-1">{t("Выйти")}</span></button>
            </form>
          </Card>
        </section>
      </div>
    </>
  );
}

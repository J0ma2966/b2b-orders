import Link from "next/link";
import { AlertTriangle, Boxes, ChevronRight, MapPin, Package, TrendingDown, TrendingUp, Truck, Warehouse } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, Badge, Card, cn } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { CountUp } from "@/components/ui/count-up";
import { TONE, TONE_LABEL } from "@/components/supplier/debt";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { SUPPLIER_ROLE_LABEL, SUPPLIER_STATUS_COLOR, SUPPLIER_STATUS_LABEL, supplierTransition } from "@/lib/statuses";
import { resubmitSupplierAction } from "./actions";
import { getT } from "@/lib/i18n/server";
import { supplierDebtStates } from "@/lib/accounts";
import { debtSummary, type DebtTone } from "@/lib/finance-core";
import { RECEIVED, tashkentDay } from "@/lib/order-core";
import { lowStockUnitIds } from "@/lib/stock";

const TZ_OFFSET_MS = 5 * 3_600_000;
// Начало суток по Ташкенту (момент времени)
const dayStart = (now: Date, plusDays = 0) => new Date(tashkentDay(now, plusDays).getTime() - TZ_OFFSET_MS);

// Главная приложения поставщика: выручка за сегодня, заказы, расчёты с магазинами по цветам и «Сделать сейчас»
export default async function SupplierHome() {
  const t = await getT();
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const s = ctx.supplier;
  const active = s.status === "ACTIVE";
  const now = new Date();
  const [members, territories, orders, today, yesterday, debts] = await Promise.all([
    db.supplierMember.groupBy({ by: ["role"], where: { supplierId: s.id, isActive: true }, _count: true }),
    db.supplierTerritory.count({ where: { supplierId: s.id } }),
    db.order.groupBy({ by: ["status"], where: { supplierId: s.id, status: { in: ["PLACED", "ACCEPTED", "ASSEMBLING", "READY", "ASSIGNED", "IN_TRANSIT"] } }, _count: true }),
    db.order.aggregate({ where: { supplierId: s.id, status: { in: RECEIVED }, completedAt: { gte: dayStart(now) } }, _sum: { total: true }, _count: true }),
    db.order.aggregate({ where: { supplierId: s.id, status: { in: RECEIVED }, completedAt: { gte: dayStart(now, -1), lt: dayStart(now) } }, _sum: { total: true } }),
    active ? supplierDebtStates(s.id, { now }) : new Map(),
  ]);
  const byStatus = Object.fromEntries(orders.map((o) => [o.status, o._count])) as Record<string, number>;
  const todo = active ? await todoList(s.id, ctx.membership.delivers ? ctx.auth.user.id : null) : [];
  const inWork = (byStatus.ACCEPTED ?? 0) + (byStatus.ASSEMBLING ?? 0) + (byStatus.ASSIGNED ?? 0) + (byStatus.IN_TRANSIT ?? 0);
  const count = Object.fromEntries(members.map((m) => [m.role, m._count]));
  const canResubmit = supplierTransition("resubmit", s.status) !== null;
  const revenue = Number(today._sum.total ?? 0);
  const before = Number(yesterday._sum.total ?? 0);
  const change = before > 0 ? Math.round(((revenue - before) / before) * 100) : null;
  const sum = debtSummary([...debts.values()]);
  const mine = active && ctx.membership.delivers
    ? await db.order.count({ where: { supplierId: s.id, courierId: ctx.auth.user.id, status: { in: ["ASSIGNED", "IN_TRANSIT"] } } })
    : 0;
  return (
    <div className="stagger space-y-4">
      {/* Фиолетовая шапка: на телефоне — во всю ширину под верхней панелью */}
      <section className="supplier-hero relative -mx-4 -mt-4 overflow-hidden px-5 pt-5 pb-16 text-white sm:mx-0 sm:mt-0 sm:rounded-3xl sm:pb-14">
        <div className="relative flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/18 text-base font-bold" aria-hidden>
            {initials(s.displayName)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg leading-tight font-semibold">{s.displayName}</h1>
            <div className="mt-0.5 flex items-center gap-2 text-sm text-white/80">
              {!active && <Badge color={SUPPLIER_STATUS_COLOR[s.status]}>{SUPPLIER_STATUS_LABEL[s.status]}</Badge>}
              <span className="truncate">{t.person(ctx.auth.user.fullName)} · {t(SUPPLIER_ROLE_LABEL[ctx.membership.role])}</span>
            </div>
          </div>
        </div>
        {active && (
          <div className="relative mt-6 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-white/80">{t("Выручка сегодня")}</div>
              <div className="mt-0.5 text-[2rem] leading-tight font-bold tracking-tight tabular-nums" data-testid="revenue-today">
                <CountUp value={revenue} />
                <span className="ml-1.5 text-base font-semibold text-white/80">{t("сум")}</span>
              </div>
              <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/16 px-2.5 py-1 text-xs font-semibold">
                {change !== null ? (
                  <>
                    {change >= 0 ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
                    {t("{p}% к вчера", { p: change > 0 ? `+${change}` : change })}
                  </>
                ) : (
                  t("Получено заказов: {n}", { n: today._count })
                )}
              </div>
            </div>
            <svg className="hidden shrink-0 opacity-90 min-[360px]:block" width="112" height="44" viewBox="0 0 120 44" aria-hidden>
              <path d="M2 36 L18 30 L34 33 L50 22 L66 26 L82 14 L98 18 L118 6 L118 44 L2 44Z" fill="white" opacity=".14" />
              <path className="spark-line" d="M2 36 L18 30 L34 33 L50 22 L66 26 L82 14 L98 18 L118 6" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </section>

      {s.status === "PENDING" && (
        <Alert tone="warning">{t("Заявка на проверке у администратора платформы. Мы пришлём уведомление, когда её рассмотрят. Пока можно заполнить профиль и добавить сотрудников.")}</Alert>
      )}
      {s.status === "NEEDS_INFO" && (
        <Alert tone="warning">
          <p className="font-medium">{t("Администратор просит дополнить сведения:")}</p>
          <p className="mt-1">{s.moderationComment}</p>
          <p className="mt-2"><Link className="underline" href="/supplier/profile">{t("Исправьте профиль и отправьте заявку снова.")}</Link></p>
        </Alert>
      )}
      {s.status === "REJECTED" && (
        <Alert tone="error">
          <p className="font-medium">{t("Заявка отклонена.")}</p>
          {s.moderationComment && <p className="mt-1">{t("Причина: {reason}", { reason: s.moderationComment })}</p>}
        </Alert>
      )}
      {s.status === "BLOCKED" && (
        <Alert tone="error">
          {t("Компания заблокирована.")} {s.moderationComment && `${t("Причина: {reason}", { reason: s.moderationComment })}. `}{t("Обратитесь к администратору платформы.")}
        </Alert>
      )}
      {canResubmit && (
        <form action={resubmitSupplierAction}>
          <SubmitButton>{t("Отправить заявку на проверку")}</SubmitButton>
        </form>
      )}

      {active && (
        <div className="relative z-10 -mt-14 grid grid-cols-3 gap-2 sm:-mt-12 sm:gap-3">
          <Kpi href="/supplier/orders?status=PLACED" icon={<Package className="size-4" />} n={byStatus.PLACED ?? 0} label={t("Новые заказы")} hot={(byStatus.PLACED ?? 0) > 0} />
          <Kpi href="/supplier/orders?status=active" icon={<Boxes className="size-4" />} n={inWork} label={t("В работе")} />
          <Kpi href="/supplier/orders?status=READY" icon={<Truck className="size-4" />} n={byStatus.READY ?? 0} label={t("Ждут доставщика")} />
        </div>
      )}

      {active && (
        <section>
          <SectionTitle title={t("Расчёты с магазинами")} href="/supplier/shops" more={t("Все")} />
          <Link href="/supplier/shops" className="block" data-testid="shop-money">
            <Card className="p-4 sm:p-5">
              <div className="text-xs text-gray-500">{t("Магазины должны")}</div>
              <div className="text-[1.375rem] font-bold tracking-tight tabular-nums">
                <CountUp value={sum.owed} /> <span className="text-sm font-semibold text-gray-500">{t("сум")}</span>
              </div>
              <div className="my-3 flex h-2.5 gap-[3px] overflow-hidden rounded-full bg-gray-100">
                {(["overdue", "due", "prepay"] as DebtTone[]).map((k) =>
                  sum[k].amount > 0 ? <i key={k} className={cn("grow-x block h-full rounded-full", TONE[k].bar)} style={{ flexGrow: sum[k].amount }} /> : null,
                )}
              </div>
              <ul className="space-y-2.5">
                {(["overdue", "due", "prepay"] as DebtTone[]).map((k) => (
                  <li key={k} className="flex items-center gap-2.5 text-sm" data-tone={k}>
                    <span className={cn("size-2.5 shrink-0 rounded-[3px]", TONE[k].dot)} aria-hidden />
                    <span className="flex-1 text-gray-700">{t(TONE_LABEL[k])}</span>
                    <span className="text-xs text-gray-400">{t("{n} маг.", { n: sum[k].shops })}</span>
                    <span className={cn("font-semibold tabular-nums", sum[k].amount > 0 ? TONE[k].text : "text-gray-400")}>{t.money(sum[k].amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Link>
        </section>
      )}

      {active && (
        <section>
          <SectionTitle title={t("Сделать сейчас")} />
          <Card className="p-0 sm:p-0">
            {todo.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-500">{t("Срочных дел нет")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {todo.map((i) => (
                  <li key={i.href}>
                    <Link href={i.href} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-brand-50/50">
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", i.tone)}>{i.icon}</span>
                      <span className="flex-1 leading-snug">{t(i.label)}</span>
                      <span className={i.urgent ? "rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-600" : "rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700"}>{i.count}</span>
                      <ChevronRight className="size-4 text-gray-300" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      {active && ctx.membership.delivers && (
        <Link href="/courier" className="flex items-center gap-3 rounded-2xl bg-linear-to-br from-brand-50 to-surface p-4 ring-1 ring-brand-100" data-testid="my-deliveries">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-on-brand"><MapPin className="size-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t("Мои доставки")}</span>
            <span className="block text-xs text-gray-500">{mine > 0 ? t("В пути и назначено: {n} · маршрут", { n: mine }) : t("Маршрут, приёмка по QR, оплата")}</span>
          </span>
          <ChevronRight className="size-4 text-gray-300" aria-hidden />
        </Link>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Link href="/supplier/team"><Card className="p-3 sm:p-4"><div className="text-lg font-semibold">{count.ADMIN ?? 0}</div><div className="text-xs text-gray-500">{t("Администраторы")}</div></Card></Link>
        <Link href="/supplier/delivery"><Card className="p-3 sm:p-4"><div className="text-lg font-semibold">{count.COURIER ?? 0}</div><div className="text-xs text-gray-500">{t("Доставщики")}</div></Card></Link>
        <Link href="/supplier/territory"><Card className="p-3 sm:p-4"><div className="text-lg font-semibold">{territories}</div><div className="text-xs text-gray-500">{t("Территорий доставки")}</div></Card></Link>
      </div>
    </div>
  );
}

function initials(name: string) {
  const words = name.replace(/[«»"'()]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !/^(ООО|ЧП|ИП|MChJ|XK|YaTT|OOO)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || name.slice(0, 2)).toUpperCase();
}

function Kpi({ href, icon, n, label, hot }: { href: string; icon: ReactNode; n: number; label: string; hot?: boolean }) {
  return (
    <Link href={href} className="block rounded-2xl bg-surface p-3 shadow-[0_4px_16px_-4px_rgb(46_16_101/0.12)] ring-1 ring-gray-200/70">
      <span className="mb-2 grid size-7 place-items-center rounded-lg bg-brand-50 text-brand-600" aria-hidden>{icon}</span>
      <div className={cn("text-2xl leading-tight font-bold tabular-nums", hot && "text-brand-600")}>{n}</div>
      <div className="mt-0.5 min-h-[2lh] text-[11.5px] leading-tight text-gray-500">{label}</div>
    </Link>
  );
}

function SectionTitle({ title, href, more }: { title: string; href?: string; more?: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between px-1">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {href && more && (
        <Link href={href} className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-600">
          {more}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

const ICON = "size-[18px]";

// П1: «Сделать сейчас» — что ждёт решения поставщика, со ссылками
async function todoList(supplierId: string, selfDeliverer: string | null) {
  const [placed, problems, cancelRequests, replacements, low, debts, overdueInvoices, ready, mine] = await Promise.all([
    db.order.count({ where: { supplierId, status: "PLACED" } }),
    db.order.count({ where: { supplierId, status: "DELIVERY_PROBLEM" } }),
    db.order.count({ where: { supplierId, status: "NEEDS_CONFIRMATION" } }),
    db.replacement.count({ where: { supplierId, status: "NEW" } }),
    lowStockUnitIds(supplierId),
    supplierDebtStates(supplierId),
    db.commissionInvoice.count({ where: { supplierId, status: "ISSUED", dueDate: { lt: new Date() } } }),
    db.order.count({ where: { supplierId, status: "READY" } }),
    selfDeliverer ? db.order.count({ where: { supplierId, courierId: selfDeliverer, status: { in: ["ASSIGNED", "IN_TRANSIT"] } } }) : 0,
  ]);
  const overdue = [...debts.values()].filter((d) => d.tone === "overdue").length;
  const violet = "bg-brand-50 text-brand-600";
  const red = "bg-red-50 text-red-600";
  const items = [
    { label: "Новые заказы ждут ответа", count: placed, href: "/supplier/orders?status=PLACED", urgent: true, icon: <Package className={ICON} />, tone: violet },
    { label: "Проблемы доставки", count: problems, href: "/supplier/orders?status=DELIVERY_PROBLEM", urgent: true, icon: <AlertTriangle className={ICON} />, tone: red },
    { label: "Магазины просят отменить заказ", count: cancelRequests, href: "/supplier/orders?status=NEEDS_CONFIRMATION", urgent: true, icon: <AlertTriangle className={ICON} />, tone: red },
    { label: "Просроченные долги магазинов", count: overdue, href: "/supplier/shops?status=overdue", urgent: true, icon: <AlertTriangle className={ICON} />, tone: red },
    { label: "Готовы к доставке, доставщик не назначен", count: ready, href: "/supplier/orders?status=READY", urgent: false, icon: <Truck className={ICON} />, tone: "bg-sky-50 text-sky-700" },
    { label: "Мои доставки", count: mine, href: "/courier", urgent: false, icon: <MapPin className={ICON} />, tone: violet },
    { label: "Заявки на замену", count: replacements, href: "/supplier/replacements?status=NEW", urgent: false, icon: <Package className={ICON} />, tone: violet },
    { label: "Товары на исходе", count: low.length, href: "/supplier/stock?status=low", urgent: false, icon: <Warehouse className={ICON} />, tone: "bg-amber-50 text-amber-700" },
    { label: "Просрочен счёт на комиссию", count: overdueInvoices, href: "/supplier/commission", urgent: true, icon: <AlertTriangle className={ICON} />, tone: red },
  ];
  return items.filter((i) => i.count > 0);
}

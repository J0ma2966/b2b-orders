import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Banknote, CalendarClock, ChevronLeft, PenLine, Phone, Wallet } from "lucide-react";
import { Alert, Badge, Card, cn, DefinitionList } from "@/components/ui";
import { CountUp } from "@/components/ui/count-up";
import { Sheet } from "@/components/ui/sheet";
import { OrdersList } from "@/components/orders/order-view";
import { DebtHistory } from "@/components/orders/debt-history";
import { CreditForm, DebtPaymentForm } from "@/components/orders/finance-forms";
import { CorrectionForm } from "@/components/orders/supplier-forms";
import { compactMoney, TONE } from "@/components/supplier/debt";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { debtEntries } from "@/lib/delivery";
import { formatPhone } from "@/lib/phone";
import { SHOP_STATUS_COLOR, SHOP_STATUS_LABEL } from "@/lib/statuses";
import { getT } from "@/lib/i18n/server";
import { accountState } from "@/lib/accounts";
import { debtTone } from "@/lib/finance-core";

const DAY = 86_400_000;
const daysUntil = (d: Date) => Math.max(0, Math.ceil((d.getTime() - Date.now()) / DAY));

// Карточка магазина у поставщика: счёт цветом долга, оплата и корректировка в шторке, работа в долг, история
export default async function SupplierShopPage({ params }: PageProps<"/supplier/shops/[shopId]">) {
  const t = await getT();
  const ctx = await requireActiveSupplier();
  const { shopId } = await params;
  const [shop, orders, stats, state] = await Promise.all([
    db.shop.findUnique({ where: { id: shopId } }),
    db.order.findMany({ where: { shopId, supplierId: ctx.supplier.id, status: { not: "DRAFT" } }, orderBy: { placedAt: "desc" }, take: 20 }),
    db.order.aggregate({ where: { shopId, supplierId: ctx.supplier.id, status: { in: ["COMPLETED", "PARTIALLY_ACCEPTED"] } }, _sum: { total: true }, _count: true }),
    accountState(db, shopId, ctx.supplier.id),
  ]);
  const { account, aging, balance } = state;
  if (!shop || (orders.length === 0 && !account)) notFound();
  const entries = account ? await debtEntries(account.id) : [];
  const tone = debtTone(balance, aging?.overdueAmount ?? 0);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
  const limit = account?.creditAllowed && account.creditLimit != null ? Number(account.creditLimit) : null;
  const used = limit && balance > 0 ? Math.min(100, Math.round((balance / limit) * 100)) : 0;
  const daysLeft = aging && aging.overdueAmount === 0 ? daysUntil(aging.dueDate) : null;
  const HeroIcon = tone === "overdue" ? AlertTriangle : tone === "due" ? CalendarClock : Wallet;
  const payment = (
    <DebtPaymentForm shopId={shop.id} today={today} balance={balance} overdueAmount={aging?.overdueAmount ?? 0} />
  );
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Link href="/supplier/shops" className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-gray-700 shadow-sm ring-1 ring-gray-200/70" aria-label={t("← Магазины")}>
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold sm:text-xl">{shop.name}</h1>
        <a href={`tel:${shop.phone}`} className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-gray-700 shadow-sm ring-1 ring-gray-200/70" aria-label={t("Позвонить")}>
          <Phone className="size-[18px]" aria-hidden />
        </a>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        <div className="stagger min-w-0 space-y-4 lg:col-span-2">
          {/* Счёт магазина: цвет — состояние долга */}
          <section
            className={cn("balance-hero relative overflow-hidden rounded-3xl bg-linear-to-br p-5 text-white shadow-[0_12px_30px_-12px_rgb(0_0_0/0.35)]", TONE[tone].hero)}
            data-tone={tone}
            data-testid="balance-hero"
          >
            <span className="pointer-events-none absolute -top-12 -right-10 size-44 rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.2),transparent_70%)]" aria-hidden />
            <div className="flex items-center gap-1.5 text-sm text-white/85">
              <HeroIcon className="size-4" aria-hidden />
              {tone === "prepay" ? t("Переплата · на счёту магазина") : tone === "none" ? t("Долга нет") : t("Задолженность")}
              {shop.isBlocked && <Badge color="red">{t("Заблокирован")}</Badge>}
            </div>
            <div className="mt-1 text-[2rem] leading-tight font-bold tracking-tight tabular-nums">
              <CountUp value={Math.abs(balance)} />
              <span className="ml-1.5 text-base font-semibold text-white/85">{t("сум")}</span>
            </div>
            {tone !== "none" && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/18 px-3 py-2 text-[13px] leading-snug">
                <HeroIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  {tone === "overdue" && aging
                    ? t("Просрочено {sum} на {days} дн. Новые заказы магазин получает только с полной оплатой.", { sum: t.money(aging.overdueAmount), days: aging.overdueDays })
                    : tone === "due" && aging
                      ? t("Оплатить до {date}. Осталось {d} дн.", { date: t.date(aging.dueDate), d: daysLeft ?? 0 })
                      : tone === "due"
                        ? t("Срок оплаты не задан — долг не просрочивается")
                        : t("Деньги спишутся со следующего заказа.")}
                </span>
              </div>
            )}
          </section>

          <div className="grid grid-cols-3 gap-2">
            <Sheet
              title={t("Принять оплату")}
              subtitle={`${shop.name} · ${tone === "prepay" ? t("на счёту {sum}", { sum: t.money(-balance) }) : t("сейчас {sum}", { sum: t.money(Math.max(0, balance)) })}`}
              triggerClassName={action}
              testId="pay-sheet"
              theme="supplier"
              trigger={<><span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-on-brand"><Banknote className="size-[18px]" aria-hidden /></span>{t("Принять оплату")}</>}
            >
              {payment}
            </Sheet>
            <a href={`tel:${shop.phone}`} className={action}>
              <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600"><Phone className="size-[18px]" aria-hidden /></span>
              {t("Позвонить")}
            </a>
            <Sheet
              title={t("Корректировка")}
              subtitle={t("Исправление ошибок: исходные операции не меняются.")}
              triggerClassName={action}
              testId="correction-sheet"
              theme="supplier"
              trigger={<><span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600"><PenLine className="size-[18px]" aria-hidden /></span>{t("Корректировка")}</>}
            >
              <CorrectionForm shopId={shop.id} />
            </Sheet>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat value={String(stats._count)} label={t("Получено заказов")} />
            <Stat value={compactMoney(Number(stats._sum.total ?? 0), t)} label={t("Оборот")} />
            <Stat value={account?.paymentTermDays ? t("{d} дн.", { d: account.paymentTermDays }) : "—"} label={t("Срок оплаты")} />
          </div>

          {limit !== null && (
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <b>{t("Работа в долг")}</b>
                <span className="text-xs text-gray-500">{t("Лимит {sum}", { sum: t.money(limit) })}</span>
              </div>
              <div className="my-2 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className={cn("progress-fill h-full rounded-full", tone === "overdue" ? "bg-red-600" : tone === "due" ? "bg-amber-500" : "bg-brand-500")} style={{ width: `${used}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{t("Использовано {p}%", { p: used })}</span>
                <span>{t("Осталось {sum}", { sum: t.money(Math.max(0, limit - Math.max(0, balance))) })}</span>
              </div>
            </Card>
          )}

          <h2 className="px-1 font-semibold">{t("История задолженности")}</h2>
          <DebtHistory entries={entries} orderHref={(id) => `/supplier/orders/${id}`} />
          <h2 className="px-1 font-semibold">{t("Заказы")}</h2>
          <OrdersList rows={orders} href={(id) => `/supplier/orders/${id}`} party={() => shop.name} />
        </div>
        <div className="space-y-4">
          <Card>
            <DefinitionList
              items={[
                ["Статус", <Badge key="s" color={SHOP_STATUS_COLOR[shop.status]}>{SHOP_STATUS_LABEL[shop.status]}</Badge>],
                ["Телефон", <a key="p" href={`tel:${shop.phone}`} className="text-brand-600">{formatPhone(shop.phone)}</a>],
                ["Контакт", shop.contactName],
                ["Адрес", shop.address],
                ["ИНН", shop.inn],
                ["Регистрация", t.date(shop.createdAt)],
              ]}
            />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{t("Работа в долг")}</h2>
            <CreditForm shopId={shop.id} creditAllowed={account?.creditAllowed ?? false} creditLimit={account?.creditLimit?.toString() ?? ""} paymentTermDays={account?.paymentTermDays?.toString() ?? ""} />
          </Card>
          {shop.isBlocked && <Alert tone="error">{t("Магазин заблокирован платформой")}</Alert>}
        </div>
      </div>
    </>
  );
}

const action = "flex w-full flex-col items-center gap-1.5 rounded-2xl bg-surface px-1.5 py-3 text-xs font-semibold text-gray-700 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-gray-200/70";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-surface px-3 py-2.5 ring-1 ring-gray-200/70">
      <b className="block text-sm leading-tight tabular-nums [overflow-wrap:anywhere]">{value}</b>
      <span className="mt-0.5 block text-[11px] leading-tight text-gray-500">{label}</span>
    </div>
  );
}

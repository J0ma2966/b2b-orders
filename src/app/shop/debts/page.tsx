import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, TriangleAlert } from "lucide-react";
import { ExportLink } from "@/components/ui/export-link";
import { cn, EmptyState } from "@/components/ui";
import { balanceLabel } from "@/components/orders/order-view";
import { DEBT_TYPE_LABEL } from "@/components/orders/debt-history";
import { Avatar, Progress } from "@/components/shop/ui";
import { db } from "@/lib/db";
import { requireShopOwner } from "@/lib/auth/current";
import { debtEntries } from "@/lib/delivery";
import { getT } from "@/lib/i18n/server";
import { accountState } from "@/lib/accounts";
import { PAYMENT_LABEL } from "@/lib/order-core";
import { fileUrl } from "@/lib/storage-url";

// Задолженность магазина по каждому поставщику (ТЗ п. 75): общий долг и лимит, поставщики, последние операции
export default async function ShopDebtsPage() {
  const [ctx, t] = await Promise.all([requireShopOwner(), getT()]);
  const accounts = await db.shopAccount.findMany({ where: { shopId: ctx.shop.id }, include: { supplier: true }, orderBy: { balance: "desc" } });
  const [histories, states] = await Promise.all([
    Promise.all(accounts.map((a) => debtEntries(a.id, 50))),
    Promise.all(accounts.map((a) => accountState(db, ctx.shop.id, a.supplierId))),
  ]);
  const rows = accounts.map((a, i) => {
    const balance = Number(a.balance);
    const limit = a.creditAllowed && a.creditLimit !== null ? Number(a.creditLimit) : null;
    const usage = limit ? Math.max(0, balance) / limit : 0;
    return { a, balance, limit, usage, aging: states[i].aging };
  });
  const total = rows.reduce((s, r) => s + Math.max(0, r.balance), 0);
  const limited = rows.filter((r) => r.limit);
  const limitTotal = limited.reduce((s, r) => s + r.limit!, 0);
  const limitUsed = limited.reduce((s, r) => s + Math.max(0, r.balance), 0);
  // Самое срочное: сперва просрочка, иначе ближайший срок оплаты
  const overdue = rows.filter((r) => (r.aging?.overdueAmount ?? 0) > 0).sort((x, y) => y.aging!.overdueAmount - x.aging!.overdueAmount);
  const nextDue = rows.filter((r) => r.aging && r.balance > 0).sort((x, y) => x.aging!.dueDate.getTime() - y.aging!.dueDate.getTime())[0];
  const feed = histories
    .flatMap((h, i) => h.map((e) => ({ ...e, supplier: accounts[i].supplier.displayName })))
    .sort((x, y) => y.occurredAt.getTime() - x.occurredAt.getTime())
    .slice(0, 40);
  const currency = t.money(0).replace(/^0\s/, "");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-tight">{t("Задолженность")}</h1>
        <ExportLink href="/api/export/shop/debts" />
      </div>
      {accounts.length === 0 ? (
        <EmptyState>{t("Задолженности нет")}</EmptyState>
      ) : (
        <>
          <section className="rounded-[1.75rem] bg-night p-5 text-white">
            <div className="text-sm text-white/60">{t("Общий долг")}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-[2.4rem] leading-none font-bold tracking-tight tabular-nums">{t.money(total).replace(/\s\S+$/, "")}</span>
              <span className="font-display text-lg font-bold text-white/50">{currency}</span>
            </div>
            {limitTotal > 0 && (
              <div className="mt-5">
                <Progress value={limitUsed / limitTotal} tone="lime" />
                <div className="mt-2 flex justify-between gap-3 text-sm text-white/70">
                  <span>{t("Использовано {pct}%", { pct: Math.round((limitUsed / limitTotal) * 100) })}</span>
                  <span className="tabular-nums">{t("Лимит {sum}", { sum: t.money(limitTotal) })}</span>
                </div>
              </div>
            )}
            {overdue.length > 0 ? (
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-coral px-4 py-3 text-night">
                <TriangleAlert className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  {t("Просрочено у {name}: {days} дн.", { name: overdue[0].a.supplier.displayName, days: overdue[0].aging!.overdueDays })}
                </span>
                <span className="font-display font-bold tabular-nums">{t.money(overdue[0].aging!.overdueAmount).replace(/\s\S+$/, "")}</span>
              </div>
            ) : nextDue ? (
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-coral px-4 py-3 text-night">
                <CalendarDays className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 text-sm font-semibold">{t("Ближайшая оплата: {date}", { date: t.date(nextDue.aging!.dueDate) })}</span>
                <span className="font-display font-bold tabular-nums">{t.money(nextDue.balance).replace(/\s\S+$/, "")}</span>
              </div>
            ) : null}
          </section>

          <section className="divide-y divide-black/[0.06] rounded-[1.75rem] bg-surface px-4">
            {rows.map(({ a, balance, limit, usage, aging }) => {
              const hot = (aging?.overdueAmount ?? 0) > 0 || usage >= 0.8;
              return (
                <Link key={a.id} href={`/shop/suppliers/${a.supplierId}`} className="flex items-center gap-3.5 py-4">
                  <Avatar name={a.supplier.displayName} src={fileUrl(a.supplier.logoPath)} className="size-14 text-base" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-bold">{a.supplier.displayName}</span>
                      <span className="shrink-0 text-sm tabular-nums">
                        <b className={balance < 0 ? "text-brand-700" : undefined}>{balance < 0 ? balanceLabel(balance, t) : t.money(Math.max(0, balance)).replace(/\s\S+$/, "")}</b>
                        {limit && balance >= 0 && <span className="text-gray-500"> / {t.money(limit).replace(/\s\S+$/, "")}</span>}
                      </span>
                    </span>
                    {limit && <Progress value={usage} tone={hot ? "coral" : "night"} className="mt-2" />}
                    <span className={cn("mt-1.5 block text-sm", hot ? "font-semibold text-red-800" : "text-gray-500")}>
                      {aging && aging.overdueAmount > 0
                        ? t("просрочено {sum} на {days} дн.", { sum: t.money(aging.overdueAmount), days: aging.overdueDays })
                        : usage >= 0.8
                          ? t("Лимит почти исчерпан")
                          : aging
                            ? t("к оплате до {date}", { date: t.date(aging.dueDate) })
                            : a.creditAllowed
                              ? limit ? t("Работа в долг разрешена") : t("Работа в долг разрешена, без лимита")
                              : t("Работа в долг не разрешена")}
                    </span>
                  </span>
                </Link>
              );
            })}
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl font-bold">{t("Операции")}</h2>
            {feed.length === 0 ? (
              <EmptyState>{t("Операций пока нет")}</EmptyState>
            ) : (
              <ul className="divide-y divide-black/[0.06] rounded-[1.75rem] bg-surface px-4">
                {feed.map((e) => {
                  const amount = Number(e.amount);
                  const charge = amount > 0;
                  const Arrow = charge ? ArrowUpRight : ArrowDownLeft;
                  return (
                    <li key={e.id} className="flex items-center gap-3.5 py-3.5">
                      <span className={cn("grid size-12 shrink-0 place-items-center rounded-full", charge ? "bg-coral-soft text-red-800" : "bg-brand-50 text-brand-700")}>
                        <Arrow className="size-5" strokeWidth={2.4} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">
                          {t(DEBT_TYPE_LABEL[e.type])}
                          {e.order && (
                            <>
                              {" "}
                              <Link href={`/shop/orders/${e.order.id}`} className="underline-offset-4 hover:underline">№ {e.order.number}</Link>
                            </>
                          )}
                          {e.paymentMethod && <span className="font-medium text-gray-500"> · {t(PAYMENT_LABEL[e.paymentMethod])}</span>}
                        </span>
                        <span className="block truncate text-sm text-gray-500">
                          {e.supplier} · {t.date(e.occurredAt)}
                          {e.comment && <> · {t(e.comment)}</>}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={cn("block font-display font-bold tabular-nums", charge ? "text-red-800" : "text-brand-700")}>
                          {charge ? "+" : "−"}
                          {t.money(Math.abs(amount)).replace(/\s\S+$/, "")}
                        </span>
                        <span className="block text-xs text-gray-500 tabular-nums">{balanceLabel(Number(e.balanceAfter), t)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

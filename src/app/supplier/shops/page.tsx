import { ExportLink } from "@/components/ui/export-link";
import Link from "next/link";
import { Search } from "lucide-react";
import { Card, cn, EmptyState, PageHeader } from "@/components/ui";
import { DebtTag, debtAmount, NO_DEBT, shopInitials, TONE, TONE_ICON, TONE_LABEL } from "@/components/supplier/debt";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { supplierDebtStates } from "@/lib/accounts";
import { DEBT_TONE_ORDER, debtSummary, type DebtTone } from "@/lib/finance-core";
import { formatPhone } from "@/lib/phone";
import { getT } from "@/lib/i18n/server";

const TONES: DebtTone[] = ["overdue", "due", "prepay"];
const FILTERS = ["overdue", "due", "prepay", "none", "credit"] as const;

// Магазины поставщика и задолженность (ТЗ п. 73): сначала просроченные (красный), затем долги в срок (жёлтый),
// переплаты (зелёный) и магазины без долга
export default async function SupplierShopsPage({ searchParams }: PageProps<"/supplier/shops">) {
  const t = await getT();
  const ctx = await requireActiveSupplier();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const raw = typeof sp.status === "string" ? sp.status : "";
  // Старые ссылки: «С долгом» = просрочка и долг в срок
  const filter = (FILTERS as readonly string[]).includes(raw) || raw === "debt" ? raw : "";
  const [shops, states] = await Promise.all([
    db.shop.findMany({
      where: {
        OR: [{ orders: { some: { supplierId: ctx.supplier.id, status: { not: "DRAFT" } } } }, { accounts: { some: { supplierId: ctx.supplier.id } } }],
        ...(q && { name: { contains: q, mode: "insensitive" as const } }),
        ...(filter === "credit" && { accounts: { some: { supplierId: ctx.supplier.id, creditAllowed: true } } }),
      },
      include: {
        accounts: { where: { supplierId: ctx.supplier.id } },
        _count: { select: { orders: { where: { supplierId: ctx.supplier.id, status: { in: ["COMPLETED", "PARTIALLY_ACCEPTED"] } } } } },
      },
      orderBy: { name: "asc" },
      take: 300,
    }),
    supplierDebtStates(ctx.supplier.id),
  ]);
  const sum = debtSummary([...states.values()]);
  const rows = shops
    .map((s) => ({ shop: s, state: states.get(s.id) ?? { ...NO_DEBT, shopId: s.id } }))
    .filter(({ state }) => {
      if (filter === "debt") return state.tone === "overdue" || state.tone === "due";
      if ((TONES as string[]).includes(filter) || filter === "none") return state.tone === filter;
      return true;
    })
    .sort((a, b) => DEBT_TONE_ORDER[a.state.tone] - DEBT_TONE_ORDER[b.state.tone] || Math.abs(b.state.balance) - Math.abs(a.state.balance));
  const link = (status: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    const s = p.toString();
    return `/supplier/shops${s ? `?${s}` : ""}`;
  };
  const chips: [string, string, string | null][] = [
    ["", t("Все"), null],
    ["overdue", t(TONE_LABEL.overdue), TONE.overdue.dot],
    ["due", t(TONE_LABEL.due), TONE.due.dot],
    ["prepay", t(TONE_LABEL.prepay), TONE.prepay.dot],
    ["none", t(TONE_LABEL.none), null],
    ["credit", t("Работают в долг"), null],
  ];
  return (
    <>
      <PageHeader title="Магазины и долги" subtitle={t("Магазины должны: {sum}", { sum: t.money(sum.owed) })} actions={<ExportLink href="/api/export/supplier/debts" />} />
      <div className="stagger space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {TONES.map((k) => {
            const Icon = TONE_ICON[k];
            return (
              <Link key={k} href={link(filter === k ? "" : k)} className={cn("block rounded-2xl px-3 py-2.5 ring-1", TONE[k].soft)} data-testid={`sum-${k}`}>
                <span className="flex min-h-[2lh] items-start gap-1 text-[11px] leading-tight font-semibold">
                  <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
                  {t(TONE_LABEL[k])}
                </span>
                <span className="mt-1 block truncate text-[15px] font-bold tabular-nums">{t.money(sum[k].amount).replace(/\s\S+$/, "")}</span>
                <span className="block text-[11px] opacity-75">{t("{n} маг.", { n: sum[k].shops })}</span>
              </Link>
            );
          })}
        </div>

        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label={t("Фильтр")}>
          {chips.map(([v, label, dot]) => {
            const on = filter === v || (v === "" && filter === "");
            return (
              <Link
                key={v || "all"}
                href={link(v)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold ring-1",
                  on ? "bg-brand-600 text-on-brand shadow-[0_4px_12px_-2px_rgb(109_40_217/0.35)] ring-brand-600" : "bg-surface text-gray-700 ring-gray-200",
                )}
              >
                {dot && <span className={cn("size-2 rounded-full", dot)} aria-hidden />}
                {label}
              </Link>
            );
          })}
        </nav>

        <form action="/supplier/shops" role="search" className="relative">
          {filter && <input type="hidden" name="status" value={filter} />}
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t("Название магазина")}
            aria-label={t("Название магазина")}
            className="block w-full rounded-2xl border-0 bg-surface py-3 pr-3 pl-10 text-base ring-1 ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-500 focus:outline-none sm:text-sm"
          />
        </form>

        {rows.length === 0 ? (
          <EmptyState>{shops.length === 0 && !q ? t("Магазины появятся после первых заказов") : t("Магазинов не найдено")}</EmptyState>
        ) : (
          <Card className="overflow-hidden p-0!">
            <ul className="divide-y divide-gray-100">
              {rows.map(({ shop: s, state }) => (
                <li key={s.id}>
                  <Link href={`/supplier/shops/${s.id}`} className="relative flex items-center gap-3 px-4 py-3 hover:bg-brand-50/40" data-tone={state.tone} data-testid="shop-row">
                    {state.tone !== "none" && <span className={cn("absolute inset-y-3.5 left-0 w-[3px] rounded-r", TONE[state.tone].bar)} aria-hidden />}
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold", state.tone === "none" ? "bg-brand-50 text-brand-700" : TONE[state.tone].soft.replace(/ring-\S+/, ""))} aria-hidden>
                      {shopInitials(s.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{s.name}</span>
                      <span className="block truncate text-xs text-gray-500">
                        {t("заказов {n}", { n: s._count.orders })} · {formatPhone(s.phone)}
                        {s.accounts[0]?.creditAllowed ? ` · ${t("в долг разрешено")}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={cn("block text-[15px] font-bold tabular-nums", TONE[state.tone].text, state.tone === "none" && "text-gray-400")}>{debtAmount(state, t, true)}</span>
                      <DebtTag state={state} t={t} className="mt-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

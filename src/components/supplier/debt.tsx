import { AlertTriangle, CalendarClock, Clock, Wallet } from "lucide-react";
import type { ShopDebtState } from "@/lib/accounts";
import type { DebtTone } from "@/lib/finance-core";
import type { T } from "@/lib/i18n/core";
import { cn } from "@/components/ui";

// Цвета долгов магазинов в приложении поставщика (одни и те же на всех экранах):
// просрочен — красный, долг в срок — жёлтый, переплата — зелёный, долга нет — серый.
export const TONE = {
  overdue: { text: "text-red-600", soft: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-600", bar: "bg-red-600", hero: "from-red-700 to-red-500" },
  due: { text: "text-amber-600", soft: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500", bar: "bg-amber-500", hero: "from-amber-700 to-amber-500" },
  prepay: { text: "text-emerald-600", soft: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", bar: "bg-emerald-500", hero: "from-emerald-700 to-emerald-500" },
  none: { text: "text-gray-500", soft: "bg-gray-100 text-gray-600 ring-gray-200", dot: "bg-gray-300", bar: "bg-gray-300", hero: "from-brand-700 to-brand-500" },
} satisfies Record<DebtTone, Record<string, string>>;

export const TONE_LABEL: Record<DebtTone, string> = { overdue: "Просрочено", due: "Долг в срок", prepay: "Переплата", none: "Без долга" };

export const NO_DEBT: ShopDebtState = { shopId: "", balance: 0, tone: "none", overdueAmount: 0, overdueDays: 0, dueDate: null };

export const TONE_ICON = { overdue: AlertTriangle, due: Clock, prepay: Wallet, none: Wallet } satisfies Record<DebtTone, unknown>;

// Короткая подпись под суммой: «просрочено 12 дн.», «до 15 нояб.», «на счёту», «долга нет»
export function debtNote(s: ShopDebtState, t: T) {
  if (s.tone === "overdue") return t("просрочено {d} дн.", { d: s.overdueDays });
  if (s.tone === "due") return s.dueDate ? t("до {date}", { date: shortDate(s.dueDate, t) }) : t("в долг");
  if (s.tone === "prepay") return t("на счёту");
  return t("долга нет");
}

// Сумма со знаком: долг как есть, переплата с «+»; bare — без валюты (в списке, где места мало)
export function debtAmount(s: ShopDebtState, t: T, bare = false) {
  const v = bare ? (n: number) => NUM.format(n) : (n: number) => t.money(n);
  if (s.tone === "prepay") return `+${v(-s.balance)}`;
  return v(Math.max(0, s.balance));
}

const NUM = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const SHORT_DATE = {
  ru: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Asia/Tashkent" }),
  uz: new Intl.DateTimeFormat("uz-Latn-UZ", { day: "numeric", month: "short", timeZone: "Asia/Tashkent" }),
};
// «4 дек.» — срок оплаты в подписи
export function shortDate(d: Date, t: T) {
  return SHORT_DATE[t.locale].format(d);
}
// «4,7 млн сум» — оборот в маленькой плитке
export function compactMoney(v: number, t: T) {
  if (Math.abs(v) < 1_000_000) return t.money(v);
  const n = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(v / 1_000_000);
  return t("{n} млн сум", { n });
}

export function DebtTag({ state, t, className }: { state: ShopDebtState; t: T; className?: string }) {
  return (
    <span className={cn("inline-block rounded-md px-1.5 py-0.5 text-[11px] leading-tight font-bold whitespace-nowrap ring-1", TONE[state.tone].soft, className)} data-tone={state.tone}>
      {debtNote(state, t)}
    </span>
  );
}

// Пометка на заказе: что с деньгами этого магазина (просрочка — заказ только с оплатой)
export function DebtFlag({ state, t, className }: { state: ShopDebtState; t: T; className?: string }) {
  if (state.tone === "none") return null;
  const Icon = state.tone === "due" ? CalendarClock : TONE_ICON[state.tone];
  const text =
    state.tone === "overdue"
      ? t("Долг {sum} просрочен на {d} дн. · только с оплатой", { sum: t.money(state.overdueAmount), d: state.overdueDays })
      : state.tone === "due"
        ? state.dueDate
          ? t("Долг {sum} · оплатить до {date}", { sum: t.money(state.balance), date: shortDate(state.dueDate, t) })
          : t("Долг {sum}", { sum: t.money(state.balance) })
        : t("На счёту {sum} · спишется с заказа", { sum: t.money(-state.balance) });
  return (
    <div className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1", TONE[state.tone].soft, className)} data-tone={state.tone} data-testid="debt-flag">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}

// Буквы для значка магазина: «Магазин «Нур»» → «Н», «Baraka Market» → «BM»
export function shopInitials(name: string) {
  const words = name.replace(/[«»"'()]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !/^(магазин|минимаркет|супермаркет|do[ʻ'‘]koni|minimarketi|supermarketi)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || name.slice(0, 1)).toUpperCase();
}

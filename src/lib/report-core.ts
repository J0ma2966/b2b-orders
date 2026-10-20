// Периоды отчётов (ТЗ п. 69): границы считаются по времени Ташкента (UTC+5, без перехода на летнее время).
export type Period = "day" | "week" | "month" | "quarter" | "year" | "custom";

export const PERIOD_LABEL: Record<Period, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
  quarter: "Квартал",
  year: "Год",
  custom: "Период",
};

const OFFSET = 5 * 3600 * 1000;
const tashkentDate = (d: Date) => new Date(d.getTime() + OFFSET); // поля UTC = местное время
const fromLocal = (y: number, m: number, day: number) => new Date(Date.UTC(y, m, day) - OFFSET);

// [from, to) — начало периода включительно, конец исключительно.
export function periodRange(period: Period, now: Date, custom?: { from?: string; to?: string }) {
  const t = tashkentDate(now);
  const y = t.getUTCFullYear(), m = t.getUTCMonth(), d = t.getUTCDate();
  switch (period) {
    case "day":
      return { from: fromLocal(y, m, d), to: fromLocal(y, m, d + 1) };
    case "week": {
      const dow = (t.getUTCDay() + 6) % 7; // понедельник = 0
      return { from: fromLocal(y, m, d - dow), to: fromLocal(y, m, d - dow + 7) };
    }
    case "month":
      return { from: fromLocal(y, m, 1), to: fromLocal(y, m + 1, 1) };
    case "quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: fromLocal(y, q, 1), to: fromLocal(y, q + 3, 1) };
    }
    case "year":
      return { from: fromLocal(y, 0, 1), to: fromLocal(y + 1, 0, 1) };
    case "custom": {
      const parse = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").map(Number) : null);
      const f = parse(custom?.from) ?? [y, m + 1, 1];
      const e = parse(custom?.to) ?? [y, m + 1, d];
      return { from: fromLocal(f[0], f[1] - 1, f[2]), to: fromLocal(e[0], e[1] - 1, e[2] + 1) };
    }
  }
}

export function parsePeriod(v: unknown): Period {
  return typeof v === "string" && v in PERIOD_LABEL ? (v as Period) : "month";
}

export function toLocalDateInput(d: Date) {
  return tashkentDate(d).toISOString().slice(0, 10);
}

// Сводка по группам: сумма и количество, отсортировано по сумме.
export function groupSum<T>(rows: T[], key: (r: T) => string, amount: (r: T) => number, qty: (r: T) => number = () => 0) {
  const map = new Map<string, { key: string; amount: number; qty: number; count: number }>();
  for (const r of rows) {
    const k = key(r);
    const g = map.get(k) ?? { key: k, amount: 0, qty: 0, count: 0 };
    g.amount += amount(r);
    g.qty += qty(r);
    g.count += 1;
    map.set(k, g);
  }
  return [...map.values()].map((g) => ({ ...g, amount: Math.round(g.amount * 100) / 100 })).sort((a, b) => b.amount - a.amount || b.qty - a.qty);
}

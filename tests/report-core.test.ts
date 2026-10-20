import { describe, expect, it } from "vitest";
import { groupSum, periodRange } from "@/lib/report-core";

// 20.10.2026 03:00 по Ташкенту (вторник)
const now = new Date("2026-10-19T22:00:00Z");

describe("периоды отчётов", () => {
  it("день и неделя по Ташкенту", () => {
    expect(periodRange("day", now)).toEqual({ from: new Date("2026-10-19T19:00:00Z"), to: new Date("2026-10-20T19:00:00Z") });
    expect(periodRange("week", now).from).toEqual(new Date("2026-10-18T19:00:00Z")); // понедельник 19.10
  });
  it("квартал и произвольный период", () => {
    expect(periodRange("quarter", now)).toEqual({ from: new Date("2026-09-30T19:00:00Z"), to: new Date("2026-12-31T19:00:00Z") });
    expect(periodRange("custom", now, { from: "2026-01-01", to: "2026-01-31" })).toEqual({ from: new Date("2025-12-31T19:00:00Z"), to: new Date("2026-01-31T19:00:00Z") });
  });
  it("группировка сортирует по сумме", () => {
    const g = groupSum([{ k: "a", v: 1 }, { k: "b", v: 5 }, { k: "a", v: 2 }], (r) => r.k, (r) => r.v);
    expect(g.map((x) => [x.key, x.amount, x.count])).toEqual([["b", 5, 1], ["a", 3, 2]]);
  });
});

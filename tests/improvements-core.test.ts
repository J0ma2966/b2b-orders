import { describe, expect, it } from "vitest";
import { creditLeft, debtAging, requiredPayment } from "@/lib/finance-core";
import { deliveryDateOptions, isoWeekday, tashkentDay } from "@/lib/order-core";

describe("оплата при получении (Л1)", () => {
  it("без кредита — вся сумма, с учётом переплаты", () => {
    expect(requiredPayment({ creditAllowed: false, creditLimit: null }, 0, 100_000)).toBe(100_000);
    expect(requiredPayment({ creditAllowed: false, creditLimit: null }, -30_000, 100_000)).toBe(70_000);
  });
  it("прежний долг без кредита не требуется гасить, но расти он не может", () => {
    expect(requiredPayment({ creditAllowed: false, creditLimit: null }, 50_000, 100_000)).toBe(100_000);
  });
  it("кредит с лимитом: платить только то, что выше лимита", () => {
    expect(requiredPayment({ creditAllowed: true, creditLimit: 500_000 }, 450_000, 100_000)).toBe(50_000);
    expect(requiredPayment({ creditAllowed: true, creditLimit: 500_000 }, 100_000, 100_000)).toBe(0);
    expect(requiredPayment({ creditAllowed: true, creditLimit: null }, 900_000, 100_000)).toBe(0);
  });
  it("просрочка закрывает кредит", () => {
    expect(requiredPayment({ creditAllowed: true, creditLimit: 500_000, overdue: true }, 100_000, 80_000)).toBe(80_000);
    expect(creditLeft({ creditAllowed: true, creditLimit: 500_000, overdue: true }, 100_000)).toBe(0);
  });
  it("остаток кредита", () => {
    expect(creditLeft({ creditAllowed: true, creditLimit: 500_000 }, 120_000)).toBe(380_000);
    expect(creditLeft({ creditAllowed: true, creditLimit: null }, 120_000)).toBeNull();
    expect(creditLeft({ creditAllowed: false, creditLimit: null }, 0)).toBe(0);
  });
});

describe("срок оплаты долга (Л3)", () => {
  const now = new Date("2026-10-21T10:00:00Z");
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
  it("долг из свежих начислений ещё не просрочен", () => {
    const a = debtAging(70_000, [{ amount: 50_000, at: day(10) }, { amount: 70_000, at: day(3) }], 7, now)!;
    expect(a.overdueAmount).toBe(0);
    expect(a.dueDate.getTime()).toBe(day(3).getTime() + 7 * 86_400_000);
  });
  it("непогашенная часть старого начисления просрочена", () => {
    const a = debtAging(100_000, [{ amount: 50_000, at: day(10) }, { amount: 70_000, at: day(3) }], 7, now)!;
    expect(a.overdueAmount).toBe(30_000);
    expect(a.overdueDays).toBe(3);
  });
  it("без срока и без долга — нет данных", () => {
    expect(debtAging(100, [{ amount: 100, at: day(1) }], null, now)).toBeNull();
    expect(debtAging(0, [], 7, now)).toBeNull();
  });
});

describe("даты доставки (П5)", () => {
  it("до часа приёма — со следующего дня, после — через день", () => {
    const morning = new Date("2026-10-21T05:00:00Z"); // 10:00 в Ташкенте, среда
    const evening = new Date("2026-10-21T12:00:00Z"); // 17:00
    expect(deliveryDateOptions(morning, { cutoffHour: 16, weekdays: [] })[0]).toEqual(tashkentDay(morning, 1));
    expect(deliveryDateOptions(evening, { cutoffHour: 16, weekdays: [] })[0]).toEqual(tashkentDay(evening, 2));
    expect(deliveryDateOptions(evening, { cutoffHour: null, weekdays: [] })[0]).toEqual(tashkentDay(evening, 0));
  });
  it("только дни доставки района", () => {
    const now = new Date("2026-10-21T05:00:00Z");
    const days = deliveryDateOptions(now, { cutoffHour: 16, weekdays: [1, 4] });
    expect(days.every((d) => [1, 4].includes(isoWeekday(d)))).toBe(true);
    expect(isoWeekday(days[0])).toBe(4); // четверг
  });
  it("полночь по Ташкенту", () => {
    expect(tashkentDay(new Date("2026-10-21T20:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-22");
  });
});

import { describe, expect, it } from "vitest";
import { creditLeft, debtAging, requiredPayment } from "@/lib/finance-core";
import { deliveryDateOptions, isoWeekday, planRoute, tashkentDay, yandexRouteUrl } from "@/lib/order-core";
import { buildXlsx, readXlsx } from "@/lib/xlsx";
import { parseImportTable } from "@/lib/catalog-import-core";

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

describe("Д2: маршрут дня", () => {
  const stop = (id: string, lat: number | null, routeOrder: number | null = null) => ({ id, deliveryLat: lat, deliveryLng: lat === null ? null : 69, routeOrder });
  it("ближайшая точка за ближайшей от склада, без координат — в конце", () => {
    const r = planRoute([stop("far", 41.3), stop("none", null), stop("near", 41.1), stop("mid", 41.2)], { lat: 41, lng: 69 });
    expect(r.map((s) => s.id)).toEqual(["near", "mid", "far", "none"]);
  });
  it("ручной порядок первым, остальные продолжают от последней ручной точки", () => {
    const r = planRoute([stop("a", 41.1), stop("b", 41.3, 1), stop("c", 41.2), stop("d", 41.38)], { lat: 41, lng: 69 });
    expect(r.map((s) => s.id)).toEqual(["b", "d", "c", "a"]);
  });
  it("ссылка на весь маршрут в Яндекс Картах", () => {
    expect(yandexRouteUrl([stop("a", 41.1), stop("x", null), stop("b", 41.2)])).toBe("https://yandex.ru/maps/?rtext=~41.1,69~41.2,69&rtt=auto");
    expect(yandexRouteUrl([stop("x", null)])).toBeNull();
  });
});

describe("П7: Excel", () => {
  it("записанный файл читается обратно: строки, числа, спецсимволы", () => {
    const buf = buildXlsx([{ name: "Заказы/2026", rows: [["№", "Магазин", "Сумма"], [1, "«Ромашка» & <Ко>", 12500.5], [2, null, 100]] }]);
    expect(readXlsx(buf)).toEqual([["№", "Магазин", "Сумма"], [1, "«Ромашка» & <Ко>", 12500.5], [2, null, 100]]);
  });
  it("не-Excel файл — понятная ошибка", () => {
    expect(() => readXlsx(Buffer.from("name;price\nЧай;1000"))).toThrow("не похож на Excel");
  });
});

describe("П7: разбор загрузки каталога", () => {
  it("заголовки в любом порядке и по-узбекски, единицы и суммы с валютой", () => {
    const { rows, errors } = parseImportTable([
      ["Nomi", "Narx", "Birlik", "Kirim", "Artikul"],
      ["Чай", "12 500 сум", "dona", 10, "T-1"],
      ["Чай", 280000, "quti", null, "T-1"],
      ["Сахар", null, "мешок", "", null],
    ]);
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.name, r.price, r.unit.kind, r.unit.customName, r.income, r.sku])).toEqual([
      ["Чай", 12500, "PIECE", "", 10, "T-1"],
      ["Чай", 280000, "BOX", "", null, "T-1"],
      ["Сахар", null, "OTHER", "мешок", null, null],
    ]);
  });
  it("ошибочные строки пропускаются с номером строки", () => {
    const { rows, errors } = parseImportTable([
      [],
      ["Название", "Цена", "Приход"],
      ["", 100, null],
      ["Мука", "дорого", null],
      ["Мука", 100, -5],
      ["Соль", 100, null],
      ["соль", 120, null],
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Соль"]);
    expect(errors).toEqual([
      "Строка 3: не указано название",
      "Строка 4: цена — число больше нуля",
      "Строка 5: приход — число не меньше нуля",
      "Строка 7: повтор строки 6",
    ]);
  });
  it("без столбца «Название» — понятная ошибка", () => {
    expect(parseImportTable([["Цена"], [1]]).errors[0]).toContain("Нет столбца «Название»");
  });
});

import { describe, expect, it } from "vitest";
import { isSuspiciousDrop, isValidState, movementDeltas, priceChangePct } from "@/lib/stock-core";

describe("складские операции", () => {
  it("продажа списывает из резерва и физического остатка", () => {
    expect(movementDeltas("SALE", 5)).toEqual({ physical: -5, reserved: -5 });
  });
  it("перевод в возвращённые не меняет основной остаток", () => {
    expect(movementDeltas("TO_RETURNED", 2)).toEqual({ physical: 0, reserved: 0 });
  });
  it("резерв больше физического остатка недопустим", () => {
    expect(isValidState(5, 6)).toBe(false);
    expect(isValidState(5, 5)).toBe(true);
  });
});

describe("антифрод цен", () => {
  it("снижение на 30% и более — подозрительно", () => {
    expect(isSuspiciousDrop(1000, 700)).toBe(true);
    expect(isSuspiciousDrop(1000, 701)).toBe(false);
    expect(isSuspiciousDrop(1000, 1500)).toBe(false);
  });
  it("без старой цены предупреждения нет", () => {
    expect(isSuspiciousDrop(null, 100)).toBe(false);
  });
  it("процент изменения", () => expect(priceChangePct(1000, 650)).toBe(-35));
});

import { parseAmount, parseAttributes, parseSignedAmount } from "@/lib/catalog";

describe("разбор полей каталога", () => {
  it("суммы с пробелами и запятой", () => {
    expect(parseAmount("12 500")).toBe(12500);
    expect(parseAmount("12500,50")).toBe(12500.5);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("-5")).toBeNaN();
    expect(parseAmount("abc")).toBeNaN();
  });
  it("корректировка со знаком", () => {
    expect(parseSignedAmount("-3")).toBe(-3);
    expect(parseSignedAmount("+2,5")).toBe(2.5);
  });
  it("характеристики построчно", () => {
    expect(parseAttributes("Объём: 1 л\nСтрана: Узбекистан\n\nБез сахара")).toEqual([
      { name: "Объём", value: "1 л" },
      { name: "Страна", value: "Узбекистан" },
      { name: "Без сахара", value: "" },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  availableSupplierOrderActions,
  bonusEntitlement,
  orderTotal,
  planBonuses,
  shopCanCancel,
  supplierOrderTransition,
  validQty,
  type Promotion,
} from "@/lib/order-core";

const now = new Date("2026-10-20T10:00:00Z");
const promo = (over: Partial<Promotion> = {}): Promotion => ({
  id: "p1",
  triggerUnitId: "A",
  triggerQty: 10,
  giftUnitId: "B",
  giftQty: 1,
  repeatable: true,
  startsAt: new Date("2026-10-01"),
  endsAt: new Date("2026-11-01"),
  isActive: true,
  ...over,
});

describe("статусы заказа", () => {
  it("основной цикл поставщика", () => {
    expect(supplierOrderTransition("accept", "PLACED")).toBe("ACCEPTED");
    expect(supplierOrderTransition("assemble", "ACCEPTED")).toBe("ASSEMBLING");
    expect(supplierOrderTransition("ready", "ASSEMBLING")).toBe("READY");
    expect(supplierOrderTransition("ready", "PLACED")).toBeNull();
  });
  it("отклонить можно только новый заказ, отменить — принятый", () => {
    expect(availableSupplierOrderActions("PLACED")).toEqual(["accept", "reject"]);
    expect(availableSupplierOrderActions("ASSIGNED")).toEqual(["cancel"]);
    expect(availableSupplierOrderActions("IN_TRANSIT")).toEqual([]);
  });
  it("магазин отменяет сам только до начала доставки (ТЗ п. 28)", () => {
    expect(shopCanCancel("ASSIGNED")).toBe(true);
    expect(shopCanCancel("IN_TRANSIT")).toBe(false);
    expect(shopCanCancel("CANCELLED_BY_SHOP")).toBe(false);
  });
});

describe("количество и сумма", () => {
  it("штуки только целые, килограммы — дробные", () => {
    expect(validQty("PIECE", 2)).toBe(true);
    expect(validQty("PIECE", 2.5)).toBe(false);
    expect(validQty("KG", 2.5)).toBe(true);
    expect(validQty("KG", 0)).toBe(false);
  });
  it("бонус не входит в стоимость", () => {
    expect(orderTotal([
      { kind: "REGULAR", price: 3000, qty: 10 },
      { kind: "FORCED", price: 1500.5, qty: 2 },
      { kind: "BONUS", price: 3000, qty: 1 },
    ])).toBe(33001);
  });
});

describe("бонусы (ТЗ п. 50–51)", () => {
  it("за каждые 10 — один подарок", () => {
    expect(bonusEntitlement(promo(), 9, now)).toBe(0);
    expect(bonusEntitlement(promo(), 10, now)).toBe(1);
    expect(bonusEntitlement(promo(), 25, now)).toBe(2);
    expect(bonusEntitlement(promo({ repeatable: false }), 25, now)).toBe(1);
  });
  it("вне срока и выключенная акция не действуют", () => {
    expect(bonusEntitlement(promo({ endsAt: new Date("2026-10-19") }), 10, now)).toBe(0);
    expect(bonusEntitlement(promo({ isActive: false }), 10, now)).toBe(0);
  });
  it("подарок не выдаётся сверх доступного остатка", () => {
    const plan = planBonuses([promo({ giftQty: 2 })], new Map([["A", 30]]), new Map([["B", 5]]), now);
    expect(plan).toEqual([{ promotionId: "p1", giftUnitId: "B", qty: 4, entitled: 6 }]);
  });
  it("две акции на один подарок делят остаток", () => {
    const plan = planBonuses(
      [promo(), promo({ id: "p2", triggerUnitId: "C" })],
      new Map([["A", 10], ["C", 10]]),
      new Map([["B", 1]]),
      now,
    );
    expect(plan.map((p) => p.qty)).toEqual([1, 0]);
  });
});

import { creditCheck, distributePayment, minimalPayment } from "@/lib/finance-core";

describe("распределение оплаты (ТЗ п. 40–42)", () => {
  it("частичная оплата формирует долг", () => {
    expect(distributePayment(1000, 500, 0)).toMatchObject({ toOrder: 500, orderDebt: 500, balanceAfter: 500 });
  });
  it("оплата заказа и прежнего долга", () => {
    expect(distributePayment(1000, 1500, 500)).toMatchObject({ toOrder: 1000, toDebt: 500, overpaid: 0, balanceAfter: 0 });
  });
  it("переплата не даёт отрицательного долга, а копится как переплата", () => {
    expect(distributePayment(1000, 1800, 500)).toMatchObject({ toDebt: 500, overpaid: 300, balanceAfter: -300 });
  });
  it("прежняя переплата зачитывается в новый заказ", () => {
    expect(distributePayment(1000, 700, -300)).toMatchObject({ fromPrepay: 300, toOrder: 700, orderDebt: 0, balanceAfter: 0 });
  });
  it("без разрешения долг расти не может", () => {
    expect(creditCheck({ creditAllowed: false, creditLimit: null }, 0, 500)).toContain("не разрешена");
    expect(creditCheck({ creditAllowed: false, creditLimit: null }, 800, 300)).toBeNull();
    expect(creditCheck({ creditAllowed: true, creditLimit: 400 }, 0, 500)).toContain("лимит");
    expect(creditCheck({ creditAllowed: true, creditLimit: null }, 0, 5000)).toBeNull();
    expect(minimalPayment(1000, -300)).toBe(700);
    expect(minimalPayment(1000, 500)).toBe(1000);
  });
});

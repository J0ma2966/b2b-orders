import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { supplierDebtStates } from "@/lib/accounts";
import { debtSummary } from "@/lib/finance-core";

// Цвета долгов в приложении поставщика: красный — просрочка, жёлтый — долг в срок, зелёный — переплата
const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
const DAY = 86_400_000;
let supplierId = "";
const shops: Record<string, string> = {};

describe.skipIf(!enabled)("цвет долга магазина у поставщика", () => {
  beforeAll(async () => {
    const t = await db.territory.create({ data: { name: `Район долгов ${tag}`, type: "DISTRICT" } });
    supplierId = (
      await db.supplier.create({
        data: {
          legalName: "Поставщик", displayName: `Поставщик ${tag}`, inn: tag + "9", legalAddress: "-", phone: "+998900000009", email: "d@t.uz", contactPerson: "-", officeAddress: "-",
          status: "ACTIVE", commissionRate: 2, territories: { create: { territoryId: t.id } },
        },
      })
    ).id;
    // balance, срок оплаты и давность начисления долга
    const plan: [string, number, number | null, number][] = [
      ["overdue", 4_850_000, 14, 26], // начислен 26 дней назад при сроке 14 — просрочка 12 дней
      ["due", 3_120_000, 14, 6], // 6 дней назад — до срока ещё 8 дней
      ["noterm", 1_000_000, null, 90], // без срока оплаты — не просрочивается
      ["prepay", -1_200_000, null, 3],
      ["zero", 0, 7, 3],
    ];
    for (const [key, balance, term, ago] of plan) {
      const shop = await db.shop.create({ data: { name: `${key} ${tag}`, phone: "+998901234567", address: "-", lat: 41.3, lng: 69.2, contactName: "-", territoryId: t.id } });
      shops[key] = shop.id;
      await db.shopAccount.create({
        data: {
          shopId: shop.id, supplierId, balance, paymentTermDays: term,
          entries: balance > 0 ? { create: { type: "ORDER_CHARGE", amount: balance, balanceAfter: balance, occurredAt: new Date(Date.now() - ago * DAY) } } : undefined,
        },
      });
    }
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("каждый магазин получает свой цвет, счета без движения не попадают в список", async () => {
    const states = await supplierDebtStates(supplierId);
    expect(states.get(shops.overdue)).toMatchObject({ tone: "overdue", overdueAmount: 4_850_000, overdueDays: 12 });
    expect(states.get(shops.due)?.tone).toBe("due");
    expect(states.get(shops.due)?.dueDate?.getTime()).toBeGreaterThan(Date.now());
    expect(states.get(shops.noterm)).toMatchObject({ tone: "due", dueDate: null });
    expect(states.get(shops.prepay)).toMatchObject({ tone: "prepay", balance: -1_200_000 });
    expect(states.has(shops.zero)).toBe(false);

    const sum = debtSummary([...states.values()]);
    expect(sum.overdue).toEqual({ amount: 4_850_000, shops: 1 });
    expect(sum.due).toEqual({ amount: 4_120_000, shops: 2 });
    expect(sum.prepay).toEqual({ amount: 1_200_000, shops: 1 });
    expect(sum.owed).toBe(8_970_000);
  });

  it("фильтр по магазинам — только нужные счета", async () => {
    const states = await supplierDebtStates(supplierId, { shopIds: [shops.prepay] });
    expect([...states.keys()]).toEqual([shops.prepay]);
  });
});

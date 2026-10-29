import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { multiOverdueShops } from "@/lib/accounts";
import { groupMultiOverdue } from "@/lib/finance-core";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
const DAY = 86_400_000;
let territoryId = "";
const suppliers: string[] = [];

const newShop = (name: string) => db.shop.create({ data: { name: `${name} ${tag}`, phone: "+998901234567", address: "-", lat: 41, lng: 69, contactName: "-", territoryId } });

// Долг магазина у поставщика одним начислением daysAgo дней назад
async function debt(shopId: string, supplierId: string, amount: number, daysAgo: number, termDays: number | null) {
  const account = await db.shopAccount.create({ data: { shopId, supplierId, balance: amount, paymentTermDays: termDays } });
  await db.debtEntry.create({ data: { accountId: account.id, type: "ORDER_CHARGE", amount, balanceAfter: amount, occurredAt: new Date(Date.now() - daysAgo * DAY) } });
}

describe("А3: группировка просрочек", () => {
  it("магазин попадает в список, только если просрочка у двух и больше поставщиков", () => {
    const rows = groupMultiOverdue([
      { shopId: "a", supplierId: "s1", overdueAmount: 100, overdueDays: 3 },
      { shopId: "a", supplierId: "s2", overdueAmount: 300, overdueDays: 10 },
      { shopId: "b", supplierId: "s1", overdueAmount: 900, overdueDays: 40 },
      { shopId: "b", supplierId: "s2", overdueAmount: 0, overdueDays: 0 },
      { shopId: "c", supplierId: "s1", overdueAmount: 50, overdueDays: 1 },
      { shopId: "c", supplierId: "s3", overdueAmount: 60, overdueDays: 2 },
    ]);
    expect(rows.map((r) => r.shopId)).toEqual(["a", "c"]);
    expect(rows[0]).toMatchObject({ overdueTotal: 400, maxDays: 10 });
    expect(rows[0].accounts.map((a) => a.supplierId)).toEqual(["s2", "s1"]);
  });
});

describe.skipIf(!enabled)("А3: просрочка у нескольких поставщиков в базе", () => {
  beforeAll(async () => {
    territoryId = (await db.territory.create({ data: { name: `Район риска ${tag}`, type: "DISTRICT" } })).id;
    for (const i of [1, 2, 3]) {
      const s = await db.supplier.create({
        data: { legalName: "П", displayName: `Риск${i} ${tag}`, inn: `${tag}9${i}`, legalAddress: "-", phone: "+998900000009", email: "r@t.uz", contactPerson: "-", officeAddress: "-", status: "ACTIVE" },
      });
      suppliers.push(s.id);
    }
  });
  afterAll(() => db.$disconnect());

  it("находит магазин с просрочкой у двух поставщиков и не путает со сроком в будущем", async () => {
    const risky = await newShop("Риск");
    await debt(risky.id, suppliers[0], 100_000, 20, 7); // просрочен на 13 дней
    await debt(risky.id, suppliers[1], 50_000, 10, 7); // просрочен на 3 дня
    await debt(risky.id, suppliers[2], 70_000, 2, 7); // срок ещё не наступил

    const oneLate = await newShop("Один");
    await debt(oneLate.id, suppliers[0], 80_000, 30, 7);
    await debt(oneLate.id, suppliers[1], 80_000, 1, 7);

    const noTerm = await newShop("Без срока");
    await debt(noTerm.id, suppliers[0], 10_000, 90, null);
    await debt(noTerm.id, suppliers[1], 10_000, 90, null);

    const rows = (await multiOverdueShops()).filter((r) => [risky.id, oneLate.id, noTerm.id].includes(r.shopId));
    expect(rows.map((r) => r.shopId)).toEqual([risky.id]);
    expect(rows[0]).toMatchObject({ overdueTotal: 150_000, maxDays: 13 });
    expect(rows[0].accounts.map((a) => a.supplier.displayName)).toEqual([`Риск1 ${tag}`, `Риск2 ${tag}`]);

    expect(await multiOverdueShops({ shopId: oneLate.id })).toEqual([]);
    expect(await multiOverdueShops({ shopId: risky.id })).toHaveLength(1);
  });
});

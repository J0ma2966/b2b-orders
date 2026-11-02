import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { addToCart, checkout, setCartQty } from "@/lib/orders";
import { applyStock } from "@/lib/stock";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
const actor = { userId: null, onBehalfOfUserId: null };
let supplierId = "", territoryId = "";
const delivery = { paymentMethod: "CASH" as const, deliveryAddress: "-", contactName: "-", contactPhone: "+998901234567" };
const newShop = () => db.shop.create({ data: { name: `Q ${tag} ${Math.random()}`, phone: "+998901234567", address: "-", lat: 41, lng: 69, contactName: "-", territoryId } });
async function newUnit(qty: number) {
  const p = await db.product.create({ data: { supplierId, name: "Т" + Math.random(), units: { create: { kind: "PIECE", price: 1000 } } }, include: { units: true } });
  await db.$transaction((tx) => applyStock(tx, { unitId: p.units[0].id, type: "INITIAL", qty }, actor));
  return p.units[0].id;
}
// Резерв единицы должен совпадать с суммой позиций открытых заказов
async function reserveMismatch(unitId: string) {
  const u = await db.productUnit.findUniqueOrThrow({ where: { id: unitId } });
  const items = await db.orderItem.aggregate({ where: { productUnitId: unitId, order: { status: { notIn: ["DRAFT"] } } }, _sum: { qty: true } });
  return { reserved: Number(u.reservedQty), inOrders: Number(items._sum.qty ?? 0) };
}

describe.skipIf(!enabled)("параллельные действия с корзинами и остатками", () => {
  beforeAll(async () => {
    territoryId = (await db.territory.create({ data: { name: `QA ${tag}`, type: "DISTRICT" } })).id;
    supplierId = (await db.supplier.create({
      data: { legalName: "П", displayName: `QA ${tag}`, inn: tag + "9", legalAddress: "-", phone: "+998900000003", email: "q@t.uz", contactPerson: "-", officeAddress: "-", status: "ACTIVE", territories: { create: { territoryId } } },
    })).id;
  });
  afterAll(() => db.$disconnect());

  it("встречные оформления двух корзин (X,Y) и (Y,X) не падают взаимной блокировкой", async () => {
    const errors: unknown[] = [];
    for (let round = 0; round < 8; round++) {
      const x = await newUnit(100), y = await newUnit(100);
      const a = await newShop(), b = await newShop();
      await addToCart(a, supplierId, x, 1); await addToCart(a, supplierId, y, 1);
      await addToCart(b, supplierId, y, 1); await addToCart(b, supplierId, x, 1);
      const rs = await Promise.allSettled([checkout(a, supplierId, delivery), checkout(b, supplierId, delivery)]);
      for (const r of rs) if (r.status === "rejected") errors.push(r.reason);
    }
    expect(errors.map((e) => String(e).slice(0, 200))).toEqual([]);
  }, 120_000);

  it("изменение корзины сотрудником во время оформления не ломает резерв", async () => {
    const bad: unknown[] = [];
    for (let round = 0; round < 60; round++) {
      const x = await newUnit(100);
      const s = await newShop();
      await addToCart(s, supplierId, x, 2);
      const item = await db.orderItem.findFirstOrThrow({ where: { productUnitId: x } });
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      await Promise.allSettled([checkout(s, supplierId, delivery), wait(round % 20).then(() => setCartQty(s.id, item.id, 7)), wait((round * 7) % 25).then(() => addToCart(s, supplierId, x, 3))]);
      const m = await reserveMismatch(x);
      if (m.reserved !== m.inOrders) bad.push({ round, ...m });
    }
    expect(bad).toEqual([]);
  }, 120_000);
});

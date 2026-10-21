import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { addToCart, cancelByShop, checkout } from "@/lib/orders";
import { applyStock } from "@/lib/stock";
import { setUnitLink } from "@/lib/unit-links";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
const actor = { userId: null, onBehalfOfUserId: null };
let supplierId = "", territoryId = "", pieceId = "", boxId = "";
const delivery = { paymentMethod: "CASH" as const, deliveryAddress: "-", contactName: "-", contactPhone: "+998901234567" };
const newShop = () => db.shop.create({ data: { name: `Л4 ${tag} ${Math.random()}`, phone: "+998901234567", address: "-", lat: 41, lng: 69, contactName: "-", territoryId } });
const unit = (id: string) => db.productUnit.findUniqueOrThrow({ where: { id } });
const avail = async (id: string) => {
  const u = await unit(id);
  return Number(u.physicalQty) - Number(u.reservedQty);
};

describe.skipIf(!enabled)("Л4: коробка = 24 шт., один остаток в штуках", () => {
  beforeAll(async () => {
    territoryId = (await db.territory.create({ data: { name: `Район Л4 ${tag}`, type: "DISTRICT" } })).id;
    const s = await db.supplier.create({
      data: { legalName: "П", displayName: `Л4 ${tag}`, inn: tag + "4", legalAddress: "-", phone: "+998900000009", email: "l4@t.uz", contactPerson: "-", officeAddress: "-", status: "ACTIVE", territories: { create: { territoryId } } },
    });
    supplierId = s.id;
    const p = await db.product.create({
      data: { supplierId, name: "Вода", units: { create: [{ kind: "PIECE", price: 1000 }, { kind: "BOX", price: 22000 }] } },
      include: { units: true },
    });
    pieceId = p.units.find((u) => u.kind === "PIECE")!.id;
    boxId = p.units.find((u) => u.kind === "BOX")!.id;
    await db.$transaction(async (tx) => {
      await applyStock(tx, { unitId: pieceId, type: "INITIAL", qty: 50 }, actor);
      await applyStock(tx, { unitId: boxId, type: "INITIAL", qty: 2 }, actor);
    });
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it("при связывании остаток коробок переходит в штуки, коробок — сколько целых", async () => {
    expect(await setUnitLink(supplierId, boxId, { baseUnitId: pieceId, ratio: 24 })).toMatchObject({ changed: true });
    expect(await avail(pieceId)).toBe(98);
    expect(await unit(boxId)).toMatchObject({ baseUnitId: pieceId });
    expect(await avail(boxId)).toBe(4);
    // Цепочки и ссылка на себя запрещены
    await expect(setUnitLink(supplierId, pieceId, { baseUnitId: boxId, ratio: 2 })).rejects.toThrow();
    await expect(setUnitLink(supplierId, boxId, { baseUnitId: boxId, ratio: 2 })).rejects.toThrow("другой единицей");
  });

  it("приход в коробках пересчитывается в штуки и пишется в журнал штук", async () => {
    await db.$transaction((tx) => applyStock(tx, { unitId: boxId, type: "INCOME", qty: 1, reason: "Накладная 7" }, actor));
    expect(await avail(pieceId)).toBe(122);
    expect(await avail(boxId)).toBe(5);
    const last = await db.stockMovement.findFirstOrThrow({ where: { productUnitId: pieceId }, orderBy: { createdAt: "desc" } });
    expect(last.reason).toBe("Накладная 7 (1 коробка × 24)");
  });

  it("заказ коробок резервирует штуки; пока он открыт, соотношение не меняется; отмена возвращает", async () => {
    const shop = await newShop();
    await addToCart(shop, supplierId, boxId, 3);
    const r = await checkout(shop, supplierId, delivery);
    expect(r.placed).toBe(true);
    expect(Number((await unit(pieceId)).reservedQty)).toBe(72);
    expect(await avail(boxId)).toBe(2);
    await expect(setUnitLink(supplierId, boxId, { baseUnitId: pieceId, ratio: 12 })).rejects.toThrow("в работе");
    await cancelByShop(shop.id, (r as { orderId: string }).orderId, "тест");
    expect(Number((await unit(pieceId)).reservedQty)).toBe(0);
    expect(await avail(boxId)).toBe(5);
  });

  it("штуки и коробки в одной корзине берутся из общего остатка", async () => {
    const shop = await newShop();
    await addToCart(shop, supplierId, pieceId, 110);
    await addToCart(shop, supplierId, boxId, 1);
    const r = await checkout(shop, supplierId, delivery);
    expect(r.placed).toBe(false);
    expect((r as { changes: string[] }).changes.join(" ")).toContain("закончился");
    expect((await checkout(shop, supplierId, delivery)).placed).toBe(true);
    expect(await avail(pieceId)).toBe(12);
    expect(await avail(boxId)).toBe(0);
  });

  it("отвязанная коробка начинает с нуля, штуки не меняются", async () => {
    // Открытый заказ только по штукам не мешает отвязать коробку
    await setUnitLink(supplierId, boxId, null);
    expect(await unit(boxId)).toMatchObject({ baseUnitId: null, baseQty: null });
    expect(await avail(boxId)).toBe(0);
    expect(await avail(pieceId)).toBe(12);
  });
});

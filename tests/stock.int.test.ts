import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyStock, StockError } from "@/lib/stock";

// Нужна тестовая база: TEST_DATABASE_URL=postgresql://... npm test
const enabled = !!process.env.TEST_DATABASE_URL;
const actor = { userId: null, onBehalfOfUserId: null };
let unitId = "";

describe.skipIf(!enabled)("склад: резервирование и целостность", () => {
  beforeAll(async () => {
    const supplier = await db.supplier.create({
      data: { legalName: "Тест", displayName: "Тест", inn: String(Date.now()).slice(-9), legalAddress: "-", phone: "+998900000001", email: "t@t.uz", contactPerson: "-", officeAddress: "-" },
    });
    const product = await db.product.create({ data: { supplierId: supplier.id, name: "Вода 1л", units: { create: { kind: "PIECE", price: 3000 } } }, include: { units: true } });
    unitId = product.units[0].id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  const op = (type: Parameters<typeof applyStock>[1]["type"], qty: number) =>
    db.$transaction((tx) => applyStock(tx, { unitId, type, qty }, actor));

  it("приход увеличивает физический остаток", async () => {
    expect(await op("INITIAL", 10)).toEqual({ physical: 10, reserved: 0 });
  });

  it("резерв не может превысить доступный остаток", async () => {
    await op("RESERVE", 7);
    await expect(op("RESERVE", 4)).rejects.toBeInstanceOf(StockError);
    await op("RELEASE", 7);
  });

  it("одновременные резервы получают только доступное количество (ТЗ п. 80)", async () => {
    // 10 штук, 25 магазинов одновременно резервируют по 1
    const results = await Promise.allSettled(Array.from({ length: 25 }, () => op("RESERVE", 1)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(10);
    const unit = await db.productUnit.findUniqueOrThrow({ where: { id: unitId } });
    expect(Number(unit.reservedQty)).toBe(10);
    expect(Number(unit.physicalQty) - Number(unit.reservedQty)).toBe(0);
  });

  it("частичная приёмка: принятое продаётся, непринятое возвращается в доступный остаток (ТЗ п. 32)", async () => {
    // заказ на 10 из резерва, принято 6
    await op("SALE", 6);
    await op("RETURN_UNACCEPTED", 4);
    const unit = await db.productUnit.findUniqueOrThrow({ where: { id: unitId } });
    expect(Number(unit.physicalQty)).toBe(4);
    expect(Number(unit.reservedQty)).toBe(0);
  });

  it("списание не трогает зарезервированное", async () => {
    await op("RESERVE", 3);
    await expect(op("WRITE_OFF", 2)).rejects.toBeInstanceOf(StockError);
    await op("WRITE_OFF", 1);
    await op("RELEASE", 3);
  });

  it("корректировка в минус ниже нуля запрещена", async () => {
    await expect(op("ADJUSTMENT", -100)).rejects.toBeInstanceOf(StockError);
  });

  it("каждая операция записана в журнал с остатком после неё", async () => {
    const moves = await db.stockMovement.findMany({ where: { productUnitId: unitId }, orderBy: { createdAt: "asc" } });
    const last = moves.at(-1)!;
    const unit = await db.productUnit.findUniqueOrThrow({ where: { id: unitId } });
    expect(last.physicalAfter.toString()).toBe(unit.physicalQty.toString());
    expect(moves.filter((m) => m.type === "RESERVE").length).toBeGreaterThanOrEqual(11);
  });
});

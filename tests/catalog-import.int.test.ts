import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { applyImport, planImport } from "@/lib/catalog-import";
import { parseImportTable } from "@/lib/catalog-import-core";
import { applyStock } from "@/lib/stock";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
let supplierId = "";

describe.skipIf(!enabled)("П7: загрузка каталога из Excel", () => {
  beforeAll(async () => {
    const s = await db.supplier.create({
      data: { legalName: "П", displayName: `Импорт ${tag}`, inn: tag + "7", legalAddress: "-", phone: "+998900000009", email: "i@t.uz", contactPerson: "-", officeAddress: "-", status: "ACTIVE" },
    });
    supplierId = s.id;
    const p = await db.product.create({ data: { supplierId, name: "Чай чёрный", sku: "T-1", units: { create: { kind: "PIECE", price: 10000 } } }, include: { units: true } });
    await db.$transaction((tx) => applyStock(tx, { unitId: p.units[0].id, type: "INITIAL", qty: 5 }, { userId: null, onBehalfOfUserId: null }));
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it("предпросмотр, затем применение: новые товары и единицы, цены, приход", async () => {
    const { rows } = parseImportTable([
      ["Артикул", "Название", "Категория", "Единица", "Цена", "Приход"],
      ["T-1", "Чай (новое название в файле)", "", "шт.", 6000, 20],
      ["T-1", "Чай чёрный", "", "коробка", 140000, 2],
      [null, "Сахар", "Бакалея", "кг", 9000, 100],
      [null, "сахар", "Бакалея", "мешок", 400000, null],
      [null, "Соль", "Бакалея", "шт", null, null],
    ]);
    const plan = await planImport(supplierId, rows);
    expect(plan.newProducts).toEqual(["Сахар", "Соль"]);
    expect(plan.newUnits).toEqual(["Чай чёрный · коробка"]);
    expect(plan.prices).toEqual([{ label: "Чай (новое название в файле) · шт.", old: 10000, new: 6000, drop: true }]);
    expect(plan.incomes.map((i) => i.qty)).toEqual([20, 2, 100]);

    await applyImport(supplierId, rows, "прайс.xlsx");
    const products = await db.product.findMany({ where: { supplierId }, include: { units: true, category: true }, orderBy: { name: "asc" } });
    expect(products.map((p) => [p.name, p.category?.name ?? null, p.units.length])).toEqual([
      ["Сахар", "Бакалея", 2],
      ["Соль", "Бакалея", 1],
      ["Чай чёрный", null, 2],
    ]);
    const tea = products[2].units.find((u) => u.kind === "PIECE")!;
    expect([Number(tea.price), Number(tea.physicalQty)]).toEqual([6000, 25]);
    expect(await db.antifraudEvent.count({ where: { productUnitId: tea.id } })).toBe(1);
    const move = await db.stockMovement.findFirstOrThrow({ where: { productUnitId: tea.id, type: "INCOME" } });
    expect(move.reason).toBe("Загрузка из Excel: прайс.xlsx");
    // Соль без цены: в каталоге есть, но заказать нельзя
    expect(products[1].units[0].price).toBeNull();

    // Повторная загрузка того же файла без прихода ничего не меняет
    const again = parseImportTable([["Артикул", "Название", "Единица", "Цена"], ["T-1", "Чай", "шт.", 6000]]).rows;
    expect(await planImport(supplierId, again)).toMatchObject({ newProducts: [], newUnits: [], prices: [], incomes: [], unchanged: 1 });
  });
});

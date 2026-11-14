import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { readXlsx, zip } from "@/lib/xlsx";
import { orderValue } from "@/lib/finance-core";
import { changeUnitPrice } from "@/lib/pricing";

// Исправления по аудиту 14.11.2026 (методика Cloudflare security-audit)

const book = (sheet: string) =>
  zip([
    ["xl/workbook.xml", Buffer.from('<workbook><sheets><sheet name="A" r:id="rId1"/></sheets></workbook>')],
    ["xl/_rels/workbook.xml.rels", Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')],
    ["xl/worksheets/sheet1.xml", Buffer.from(sheet)],
  ]);

describe("Excel: разбор за линейное время", () => {
  it("незакрытые <row>, <c>, <v> не занимают сервер", () => {
    for (const bad of ["<row>".repeat(200_000), `<row r="1">${"<c>".repeat(200_000)}</row>`, `<row r="1"><c>${"<v>".repeat(200_000)}</c></row>`]) {
      const t = Date.now();
      try {
        readXlsx(book(`<worksheet><sheetData>${bad}</sheetData></worksheet>`));
      } catch {
        // отклонить файл тоже можно — главное быстро
      }
      expect(Date.now() - t).toBeLessThan(2000);
    }
  });

  it("обычный лист читается как раньше", () => {
    const rows = readXlsx(
      book('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Чай</t></is></c><c r="B1"><v>12500</v></c></row><row r="3"><c r="B3" t="str"><v>a&amp;b</v></c><c r="C3"/></row></sheetData></worksheet>'),
    );
    expect(rows).toEqual([["Чай", 12500], [], [null, "a&b", null]]);
  });
});

describe("комиссия: сумма заказа с корректировками не меньше нуля", () => {
  it("orderValue", () => {
    expect(orderValue(1000, -200)).toBe(800);
    expect(orderValue(1000, -5000)).toBe(0);
  });
});

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
let supplierId = "";

describe.skipIf(!enabled)("антифрод: снижение цены", () => {
  beforeAll(async () => {
    supplierId = (
      await db.supplier.create({ data: { legalName: "А", displayName: `Антифрод ${tag}`, inn: tag + "9", legalAddress: "-", phone: "+998900000009", email: "a@t.uz", contactPerson: "-", officeAddress: "-", status: "ACTIVE" } })
    ).id;
  });
  afterAll(() => db.$disconnect());

  const unitWithPrice = async (price: number) => {
    const p = await db.product.create({ data: { supplierId, name: `Товар ${Math.random()}`, units: { create: { kind: "PIECE", price } } }, include: { units: true } });
    return p.units[0].id;
  };
  const setPrice = async (unitId: string, price: number | null) => {
    await db.$transaction(async (tx) => {
      const unit = await tx.productUnit.findUniqueOrThrow({ where: { id: unitId }, include: { product: true } });
      await changeUnitPrice(tx, unit, price);
    });
  };
  const events = (unitId: string) => db.antifraudEvent.findMany({ where: { productUnitId: unitId } });

  it("стёрли цену и поставили низкую — предупреждение с прежней ценой", async () => {
    const u = await unitWithPrice(100_000);
    await setPrice(u, null);
    expect(await events(u)).toHaveLength(0);
    await setPrice(u, 1000);
    const ev = await events(u);
    expect(ev).toHaveLength(1);
    expect(Number(ev[0].oldPrice)).toBe(100_000);
  });

  it("снижение шагами меньше 30% — предупреждение, когда общее снижение дошло до 30%", async () => {
    const u = await unitWithPrice(100);
    await setPrice(u, 80);
    await setPrice(u, 75);
    expect(await events(u)).toHaveLength(0);
    await setPrice(u, 65);
    expect(await events(u)).toHaveLength(1);
    // После предупреждения отсчёт идёт заново
    await setPrice(u, 60);
    expect(await events(u)).toHaveLength(1);
  });
});

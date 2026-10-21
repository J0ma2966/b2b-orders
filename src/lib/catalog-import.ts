import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { applyStock, currentActor } from "@/lib/stock";
import { changeUnitPrice } from "@/lib/pricing";
import { unitName } from "@/lib/catalog";
import { isSuspiciousDrop } from "@/lib/stock-core";
import type { ImportRow } from "./catalog-import-core";

// П7: загрузка каталога, цен и прихода из Excel. Строка сопоставляется с товаром по артикулу,
// без артикула — по названию (без учёта регистра), единица — по виду. Пустая цена не меняет цену.

type Client = Prisma.TransactionClient | typeof db;

export type ImportPlan = {
  newProducts: string[];
  newUnits: string[];
  prices: { label: string; old: number | null; new: number; drop: boolean }[];
  incomes: { label: string; qty: number }[];
  unchanged: number;
};

async function loadCatalog(client: Client, supplierId: string) {
  const products = await client.product.findMany({ where: { supplierId, archivedAt: null }, include: { units: true } });
  const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p]));
  const byName = new Map(products.map((p) => [p.name.toLowerCase(), p]));
  return { find: (r: ImportRow) => (r.sku ? bySku.get(r.sku.toLowerCase()) : undefined) ?? byName.get(r.name.toLowerCase()) };
}

const productKey = (r: ImportRow) => (r.sku ? `sku:${r.sku.toLowerCase()}` : `name:${r.name.toLowerCase()}`);

export async function planImport(supplierId: string, rows: ImportRow[], client: Client = db): Promise<ImportPlan> {
  const { find } = await loadCatalog(client, supplierId);
  const plan: ImportPlan = { newProducts: [], newUnits: [], prices: [], incomes: [], unchanged: 0 };
  const created = new Set<string>();
  for (const r of rows) {
    const product = find(r);
    const unit = product?.units.find((u) => u.kind === r.unit.kind && u.customName.toLowerCase() === r.unit.customName.toLowerCase());
    const label = `${r.name} · ${unitName(r.unit)}`;
    let changed = false;
    if (!product) {
      if (!created.has(productKey(r))) plan.newProducts.push(r.name);
      created.add(productKey(r));
    }
    if (!unit) {
      if (product) plan.newUnits.push(label);
      changed = true;
    } else if (r.price !== null && (unit.price === null || Number(unit.price) !== r.price)) {
      const old = unit.price === null ? null : Number(unit.price);
      plan.prices.push({ label, old, new: r.price, drop: isSuspiciousDrop(old, r.price) });
      changed = true;
    }
    if (r.income) {
      plan.incomes.push({ label, qty: r.income });
      changed = true;
    }
    if (!changed) plan.unchanged++;
  }
  return plan;
}

export async function applyImport(supplierId: string, rows: ImportRow[], fileName: string) {
  const actor = await currentActor();
  return db.$transaction(
    async (tx) => {
      const plan = await planImport(supplierId, rows, tx);
      const { find } = await loadCatalog(tx, supplierId);
      const categories = new Map((await tx.category.findMany({ where: { supplierId } })).map((c) => [c.name.toLowerCase(), c]));
      const made = new Map<string, { id: string; name: string; supplierId: string; units: { id: string; kind: string; customName: string; price: Prisma.Decimal | null; baseUnitId: string | null }[] }>();
      const reason = `Загрузка из Excel: ${fileName}`.slice(0, 200);
      for (const r of rows) {
        let product = find(r) ?? made.get(productKey(r));
        if (!product) {
          let categoryId: string | null = null;
          if (r.category) {
            const c = categories.get(r.category.toLowerCase()) ?? (await tx.category.create({ data: { supplierId, name: r.category } }));
            categories.set(r.category.toLowerCase(), c);
            categoryId = c.id;
          }
          const p = await tx.product.create({ data: { supplierId, name: r.name, sku: r.sku, brand: r.brand, description: r.description, categoryId } });
          product = { ...p, units: [] };
          made.set(productKey(r), product);
        }
        let unit = product.units.find((u) => u.kind === r.unit.kind && u.customName.toLowerCase() === r.unit.customName.toLowerCase());
        if (!unit) {
          unit = await tx.productUnit.create({ data: { productId: product.id, kind: r.unit.kind, customName: r.unit.customName, price: r.price, sortOrder: product.units.length } });
          product.units.push(unit);
          if (r.price !== null) await tx.priceHistory.create({ data: { productUnitId: unit.id, oldPrice: null, newPrice: r.price, userId: actor.userId } });
          if (r.income) await applyStock(tx, { unitId: unit.id, type: "INITIAL", qty: r.income, reason }, actor);
          continue;
        }
        if (r.price !== null) await changeUnitPrice(tx, { id: unit.id, price: unit.price, product: { name: product.name, supplierId } }, r.price);
        if (r.income) await applyStock(tx, { unitId: unit.id, type: "INCOME", qty: r.income, reason }, actor);
      }
      return plan;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

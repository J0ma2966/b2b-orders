"use server";

import { revalidatePath } from "next/cache";
import { requireActiveSupplier } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { isRealFile } from "@/lib/storage";
import { readXlsx, XlsxError } from "@/lib/xlsx";
import { IMPORT_COLUMNS, parseImportTable, type ImportRow } from "@/lib/catalog-import-core";
import { unitName } from "@/lib/catalog";
import { applyImport, planImport, type ImportPlan } from "@/lib/catalog-import";
import { StockError } from "@/lib/stock";

export type ImportState = { error?: string; errors?: string[]; plan?: ImportPlan; payload?: string; fileName?: string; done?: boolean; at?: number };

const MAX_BYTES = 5 * 1024 * 1024;

function roleTag(role: string) {
  return role === "OWNER" ? "SUPPLIER_OWNER" : "SUPPLIER_ADMIN";
}

// Шаг 1 — разобрать файл и показать, что изменится; шаг 2 — применить те же строки.
// Строки возвращаются форме и приходят обратно: на сервере они проверяются заново.
export async function importCatalogAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ctx = await requireActiveSupplier();
  const payload = formData.get("payload");
  if (typeof payload === "string" && payload) {
    const fileName = String(formData.get("fileName") ?? "").slice(0, 120);
    let rows: ImportRow[];
    try {
      rows = parseImportTable(JSON.parse(payload)).rows;
    } catch {
      return { error: "Не удалось прочитать данные, загрузите файл ещё раз" };
    }
    let plan: ImportPlan;
    try {
      plan = await applyImport(ctx.supplier.id, rows, fileName);
    } catch (e) {
      if (e instanceof StockError) return { error: e.message };
      throw e;
    }
    await writeAudit({
      entity: "Supplier",
      entityId: ctx.supplier.id,
      action: "catalog.import",
      actorRole: roleTag(ctx.membership.role),
      supplierId: ctx.supplier.id,
      comment: fileName,
      changes: [
        { field: "newProducts", old: null, new: plan.newProducts.length },
        { field: "newUnits", old: null, new: plan.newUnits.length },
        { field: "prices", old: null, new: plan.prices.length },
        { field: "incomes", old: null, new: plan.incomes.length },
      ],
    });
    revalidatePath("/supplier/catalog", "layout");
    revalidatePath("/supplier/stock", "layout");
    return { plan, done: true, fileName, at: Date.now() };
  }

  const file = formData.get("file");
  if (!isRealFile(file)) return { error: "Выберите файл Excel (.xlsx)" };
  if (file.size > MAX_BYTES) return { error: "Файл больше 5 МБ — загрузите его частями" };
  let table: (string | number | null)[][];
  try {
    table = readXlsx(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof XlsxError || e instanceof RangeError) return { error: e instanceof XlsxError ? e.message : "Файл слишком большой" };
    return { error: "Файл не похож на Excel (.xlsx)" };
  }
  const { rows, errors } = parseImportTable(table);
  if (rows.length === 0) return { error: "В файле нет строк для загрузки", errors };
  const plan = await planImport(ctx.supplier.id, rows);
  // Обратно уходят только разобранные строки в виде таблицы — тем же разбором они проверятся при применении
  const compact = [
    [...IMPORT_COLUMNS],
    ...rows.map((r) => [r.sku, r.name, r.category, unitName(r.unit), r.price, r.income, r.brand, r.description]),
  ];
  return { plan, errors, payload: JSON.stringify(compact), fileName: file.name, at: Date.now() };
}

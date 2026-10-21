"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { diffFields, writeAudit } from "@/lib/audit";
import { applyStock, StockError } from "@/lib/stock";
import { changeUnitPrice } from "@/lib/pricing";
import { isSuspiciousDrop } from "@/lib/stock-core";
import { realFiles, saveImage, UploadError } from "@/lib/storage";
import { parseAmount, parseAttributes, parseSignedAmount, UNIT_KINDS } from "@/lib/catalog";
import { formValues, invalid, opt, parseForm, req, success, type FormState } from "@/lib/forms";
import type { UnitKind } from "@/generated/prisma/enums";

const MAX_PHOTOS = 8;

function roleTag(role: string) {
  return role === "OWNER" ? "SUPPLIER_OWNER" : "SUPPLIER_ADMIN";
}

async function loadOwnProduct(productId: string) {
  const ctx = await requireActiveSupplier();
  const product = await db.product.findUnique({ where: { id: productId }, include: { units: true } });
  if (!product || product.supplierId !== ctx.supplier.id) return { ctx, product: null };
  return { ctx, product };
}

async function savePhotos(formData: FormData) {
  const paths: string[] = [];
  for (const f of realFiles(formData, "photos", MAX_PHOTOS)) paths.push(await saveImage(f, "products"));
  return paths;
}

// ───────────── Категории ─────────────

export async function saveCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const name = String(formData.get("name") ?? "").trim();
  const id = String(formData.get("id") ?? "");
  if (!name) return { fieldErrors: { name: ["Введите название"] } };
  const dup = await db.category.findFirst({ where: { supplierId: ctx.supplier.id, name, NOT: id ? { id } : undefined } });
  if (dup) return { fieldErrors: { name: ["Такая категория уже есть"] } };
  if (id) {
    const cat = await db.category.findUnique({ where: { id } });
    if (!cat || cat.supplierId !== ctx.supplier.id) return { error: "Категория не найдена" };
    await db.category.update({ where: { id }, data: { name } });
    await writeAudit({ entity: "Category", entityId: id, action: "update", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, changes: [{ field: "name", old: cat.name, new: name }] });
  } else {
    const cat = await db.category.create({ data: { supplierId: ctx.supplier.id, name } });
    await writeAudit({ entity: "Category", entityId: cat.id, action: "create", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, changes: [{ field: "name", old: null, new: name }] });
  }
  revalidatePath("/supplier/catalog", "layout");
  return success(id ? "Категория переименована" : `Добавлена категория «${name}»`);
}

export async function toggleCategoryAction(formData: FormData) {
  const ctx = await requireActiveSupplier();
  const cat = await db.category.findUnique({ where: { id: String(formData.get("id") ?? "") } });
  if (!cat || cat.supplierId !== ctx.supplier.id) return;
  await db.category.update({ where: { id: cat.id }, data: { isArchived: !cat.isArchived } });
  await writeAudit({ entity: "Category", entityId: cat.id, action: cat.isArchived ? "restore" : "archive", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id });
  revalidatePath("/supplier/catalog", "layout");
}

// ───────────── Товар (ТЗ п. 14) ─────────────

const productSchema = z.object({
  name: req(),
  description: opt(),
  brand: opt(),
  sku: opt(),
  categoryId: opt(),
  weightKg: opt(),
  attributes: opt(),
});

function productData(d: z.infer<typeof productSchema>, formData: FormData) {
  const weight = parseAmount(d.weightKg);
  return {
    weightError: Number.isNaN(weight),
    data: {
      name: d.name,
      description: d.description ?? null,
      brand: d.brand ?? null,
      sku: d.sku ?? null,
      categoryId: d.categoryId ?? null,
      weightKg: Number.isNaN(weight) ? null : weight,
      attributes: parseAttributes(d.attributes),
      isAvailable: formData.get("isAvailable") === "on",
      allowReplacement: formData.get("allowReplacement") === "on",
    },
  };
}

async function checkCategory(supplierId: string, categoryId: string | null) {
  if (!categoryId) return true;
  const cat = await db.category.findUnique({ where: { id: categoryId } });
  return !!cat && cat.supplierId === supplierId;
}

type UnitRow = { kind: UnitKind; customName: string; price: number | null; qty: number | null };

// Строки единиц из формы: kind[], customName[], price[], qty[]
function readUnitRows(formData: FormData, skipBlank = false): { rows: UnitRow[]; error?: string } {
  const kinds = formData.getAll("unitKind").map(String);
  const names = formData.getAll("unitName").map((v) => String(v).trim());
  const prices = formData.getAll("unitPrice").map(String);
  const qtys = formData.getAll("unitQty").map(String);
  const rows: UnitRow[] = [];
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i] as UnitKind;
    if (!kind) continue;
    // При редактировании пустая строка новой единицы — не добавлять
    if (skipBlank && !prices[i]?.trim() && !qtys[i]?.trim()) continue;
    if (!UNIT_KINDS.includes(kind)) return { rows, error: "Неверная единица измерения" };
    if (kind === "OTHER" && !names[i]) return { rows, error: "Укажите название для единицы «другая»" };
    const price = parseAmount(prices[i]);
    const qty = parseAmount(qtys[i]);
    if (Number.isNaN(price)) return { rows, error: "Цена — число, например 12 500" };
    if (Number.isNaN(qty)) return { rows, error: "Остаток — число не меньше нуля" };
    rows.push({ kind, customName: kind === "OTHER" ? names[i] : "", price, qty });
  }
  const keys = rows.map((r) => `${r.kind}:${r.customName}`);
  if (new Set(keys).size !== keys.length) return { rows, error: "Одна и та же единица указана дважды" };
  return { rows };
}

export async function createProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const parsed = parseForm(productSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const { data, weightError } = productData(parsed.data, formData);
  const values = formValues(formData);
  if (weightError) return { fieldErrors: { weightKg: ["Вес — число, например 1,5"] }, values };
  if (!(await checkCategory(ctx.supplier.id, data.categoryId))) return { fieldErrors: { categoryId: ["Неверная категория"] }, values };
  const units = readUnitRows(formData);
  if (units.error) return { error: units.error, values };
  if (units.rows.length === 0) return { error: "Добавьте хотя бы одну единицу продажи", values };

  let photoPaths: string[];
  try {
    photoPaths = (await savePhotos(formData)).slice(0, MAX_PHOTOS);
  } catch (e) {
    if (e instanceof UploadError) return { fieldErrors: { photos: [e.message] }, values };
    throw e;
  }

  const product = await db.$transaction(async (tx) => {
    const p = await tx.product.create({ data: { ...data, supplierId: ctx.supplier.id, photoPaths } });
    for (const [i, row] of units.rows.entries()) {
      const unit = await tx.productUnit.create({
        data: { productId: p.id, kind: row.kind, customName: row.customName, price: row.price, sortOrder: i },
      });
      if (row.price !== null) await tx.priceHistory.create({ data: { productUnitId: unit.id, oldPrice: null, newPrice: row.price, userId: ctx.auth.realUser.id } });
      if (row.qty) await applyStock(tx, { unitId: unit.id, type: "INITIAL", qty: row.qty, reason: "Начальный остаток при создании товара" });
    }
    await writeAudit(
      {
        entity: "Product",
        entityId: p.id,
        action: "create",
        actorRole: roleTag(ctx.membership.role),
        supplierId: ctx.supplier.id,
        changes: [
          { field: "name", old: null, new: p.name },
          ...units.rows.map((r) => ({ field: `price:${r.kind}${r.customName ? `:${r.customName}` : ""}`, old: null, new: r.price })),
        ],
      },
      tx,
    );
    return p;
  });
  revalidatePath("/supplier/catalog");
  redirect(`/supplier/catalog/${product.id}?created=1`);
}

export async function updateProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, product } = await loadOwnProduct(String(formData.get("productId") ?? ""));
  if (!product) return { error: "Товар не найден" };
  const parsed = parseForm(productSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const { data, weightError } = productData(parsed.data, formData);
  if (weightError) return { fieldErrors: { weightKg: ["Вес — число, например 1,5"] } };
  if (!(await checkCategory(ctx.supplier.id, data.categoryId))) return { fieldErrors: { categoryId: ["Неверная категория"] } };
  const remove = new Set(formData.getAll("removePhoto").map(String));
  let added: string[];
  try {
    added = await savePhotos(formData);
  } catch (e) {
    if (e instanceof UploadError) return { fieldErrors: { photos: [e.message] } };
    throw e;
  }
  const photoPaths = [...product.photoPaths.filter((p) => !remove.has(p)), ...added].slice(0, MAX_PHOTOS);
  const next = { ...data, photoPaths };
  const changes = diffFields(product as unknown as Record<string, unknown>, next, [
    "name", "description", "brand", "sku", "categoryId", "weightKg", "attributes", "isAvailable", "allowReplacement", "photoPaths",
  ]);
  if (changes.length === 0) return { ok: true, message: "Изменений нет" };
  await db.product.update({ where: { id: product.id }, data: next });
  await writeAudit({ entity: "Product", entityId: product.id, action: "update", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, changes });
  revalidatePath(`/supplier/catalog/${product.id}`);
  return { ok: true, message: "Товар сохранён" };
}

// ───────────── Единицы и цены (ТЗ п. 15–16) ─────────────

export async function saveUnitsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, product } = await loadOwnProduct(String(formData.get("productId") ?? ""));
  if (!product) return { error: "Товар не найден" };
  const ids = formData.getAll("existingId").map(String);
  const prices = formData.getAll("existingPrice").map(String);
  const updates: { unit: (typeof product.units)[number]; price: number | null; isActive: boolean }[] = [];
  for (const [i, id] of ids.entries()) {
    const unit = product.units.find((u) => u.id === id);
    if (!unit) return { error: "Единица не найдена" };
    const price = parseAmount(prices[i]);
    if (Number.isNaN(price)) return { error: "Цена — число, например 12 500" };
    updates.push({ unit, price, isActive: formData.get(`active_${id}`) === "on" });
  }
  const added = readUnitRows(formData, true);
  if (added.error) return { error: added.error };
  for (const row of added.rows) {
    if (product.units.some((u) => u.kind === row.kind && u.customName === row.customName)) return { error: "Такая единица уже есть у товара" };
  }

  let antifraud = 0;
  await db.$transaction(async (tx) => {
    const changes = [];
    for (const u of updates) {
      const priceChange = await changeUnitPrice(tx, { ...u.unit, product }, u.price);
      if (priceChange) {
        changes.push({ field: `price:${u.unit.kind}${u.unit.customName ? `:${u.unit.customName}` : ""}`, old: priceChange.old, new: priceChange.new });
        if (isSuspiciousDrop(priceChange.old, priceChange.new)) antifraud++;
      }
      if (u.isActive !== u.unit.isActive) {
        await tx.productUnit.update({ where: { id: u.unit.id }, data: { isActive: u.isActive } });
        changes.push({ field: `active:${u.unit.kind}`, old: u.unit.isActive, new: u.isActive });
      }
    }
    for (const [i, row] of added.rows.entries()) {
      const unit = await tx.productUnit.create({
        data: { productId: product.id, kind: row.kind, customName: row.customName, price: row.price, sortOrder: product.units.length + i },
      });
      if (row.price !== null) await tx.priceHistory.create({ data: { productUnitId: unit.id, oldPrice: null, newPrice: row.price, userId: ctx.auth.realUser.id } });
      if (row.qty) await applyStock(tx, { unitId: unit.id, type: "INITIAL", qty: row.qty, reason: "Начальный остаток новой единицы" });
      changes.push({ field: `price:${row.kind}${row.customName ? `:${row.customName}` : ""}`, old: null, new: row.price });
    }
    if (changes.length) {
      await writeAudit({ entity: "Product", entityId: product.id, action: "units.update", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, changes }, tx);
    }
  });
  revalidatePath(`/supplier/catalog/${product.id}`);
  return success(
    antifraud
      ? "Цены сохранены. Снижение на 30% и больше отправлено на проверку администратору платформы."
      : "Единицы и цены сохранены",
  );
}

// ───────────── Удаление из каталога (ТЗ п. 17) ─────────────

export async function toggleArchiveProductAction(formData: FormData) {
  const { ctx, product } = await loadOwnProduct(String(formData.get("productId") ?? ""));
  if (!product) return;
  const archivedAt = product.archivedAt ? null : new Date();
  await db.product.update({ where: { id: product.id }, data: { archivedAt } });
  await writeAudit({
    entity: "Product",
    entityId: product.id,
    action: archivedAt ? "archive" : "restore",
    actorRole: roleTag(ctx.membership.role),
    supplierId: ctx.supplier.id,
  });
  revalidatePath("/supplier/catalog", "layout");
}

// ───────────── Складские операции (ТЗ п. 20) ─────────────

const stockSchema = z.object({
  unitId: req(),
  type: z.enum(["INCOME", "WRITE_OFF", "ADJUSTMENT"]),
  qty: req("Укажите количество"),
  reason: opt(),
});

export async function stockOperationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const parsed = parseForm(stockSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const { unitId, type, reason } = parsed.data;
  const qty = type === "ADJUSTMENT" ? parseSignedAmount(parsed.data.qty) : parseAmount(parsed.data.qty);
  if (qty === null || Number.isNaN(qty) || qty === 0) {
    return { fieldErrors: { qty: [type === "ADJUSTMENT" ? "Число со знаком, например -3 или 5" : "Число больше нуля"] } };
  }
  if ((type === "WRITE_OFF" || type === "ADJUSTMENT") && !reason) return { fieldErrors: { reason: ["Укажите основание"] } };
  const unit = await db.productUnit.findUnique({ where: { id: unitId }, include: { product: true } });
  if (!unit || unit.product.supplierId !== ctx.supplier.id) return { error: "Товар не найден" };
  try {
    await db.$transaction(async (tx) => {
      const after = await applyStock(tx, { unitId, type, qty, reason });
      await writeAudit(
        {
          entity: "ProductUnit",
          entityId: unitId,
          action: `stock.${type.toLowerCase()}`,
          actorRole: roleTag(ctx.membership.role),
          supplierId: ctx.supplier.id,
          comment: reason,
          changes: [{ field: "physicalQty", old: Number(unit.physicalQty), new: after.physical }],
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof StockError) return { error: e.message };
    throw e;
  }
  revalidatePath("/supplier/stock", "layout");
  revalidatePath(`/supplier/catalog/${unit.productId}`);
  return success("Остаток обновлён");
}

// П6: порог «мало на складе» по единице
export async function lowStockThresholdAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const unitId = String(formData.get("unitId") ?? "");
  const raw = String(formData.get("threshold") ?? "").trim();
  const threshold = raw ? parseAmount(raw) : null;
  if (raw && (threshold === null || threshold < 0)) return { fieldErrors: { threshold: ["Число от 0"] }, values: formValues(formData) };
  const unit = await db.productUnit.findUnique({ where: { id: unitId }, include: { product: true } });
  if (!unit || unit.product.supplierId !== ctx.supplier.id) return { error: "Товар не найден" };
  await db.productUnit.update({ where: { id: unitId }, data: { lowStockThreshold: threshold } });
  await writeAudit({ entity: "ProductUnit", entityId: unitId, action: "stock.threshold", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, changes: [{ field: "lowStockThreshold", old: unit.lowStockThreshold?.toString() ?? null, new: threshold }] });
  revalidatePath("/supplier/stock", "layout");
  return success(threshold === null ? "Порог убран" : "Порог сохранён");
}

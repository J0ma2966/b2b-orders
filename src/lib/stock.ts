import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { StockMovementType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getAuth } from "@/lib/auth/current";
import { movementDeltas } from "./stock-core";
import { notifySupplierStaff } from "./notify";
import { formatQty, unitName } from "./catalog";

type Tx = Prisma.TransactionClient;

export class StockError extends Error {}

export type StockOperation = {
  unitId: string;
  type: StockMovementType;
  qty: number; // > 0; для ADJUSTMENT — со знаком
  reason?: string | null;
  relatedEntity?: string;
  relatedId?: string;
};

// Атомарное изменение остатка с записью в журнал.
// Условный UPDATE не даёт уйти в минус даже при одновременных заказах:
// строка блокируется, и условие перепроверяется после ожидания (ТЗ п. 19, 80).
export async function applyStock(tx: Tx, op: StockOperation, actor?: { userId: string | null; onBehalfOfUserId: string | null }) {
  if (!Number.isFinite(op.qty) || op.qty === 0 || (op.type !== "ADJUSTMENT" && op.qty < 0)) {
    throw new StockError("Количество должно быть больше нуля");
  }
  // Л4: у связанной единицы («коробка = 24 шт.») своего остатка нет — операция идёт
  // по базовой единице в пересчёте, в журнале видно исходное количество
  const link = await tx.productUnit.findUnique({ where: { id: op.unitId }, select: { kind: true, customName: true, baseUnitId: true, baseQty: true } });
  if (link?.baseUnitId && link.baseQty) {
    const ratio = Number(link.baseQty);
    const note = `${formatQty(op.qty)} ${unitName(link)} × ${formatQty(ratio)}`;
    op = { ...op, unitId: link.baseUnitId, qty: Math.round(op.qty * ratio * 1000) / 1000, reason: op.reason ? `${op.reason} (${note})` : note };
  }
  const d = movementDeltas(op.type, op.qty);
  const p = new Prisma.Decimal(d.physical);
  const r = new Prisma.Decimal(d.reserved);
  const rows = await tx.$queryRaw<{ physicalQty: Prisma.Decimal; reservedQty: Prisma.Decimal; lowStockThreshold: Prisma.Decimal | null }[]>`
    UPDATE "ProductUnit"
       SET "physicalQty" = "physicalQty" + ${p}, "reservedQty" = "reservedQty" + ${r}, "updatedAt" = now()
     WHERE id = ${op.unitId}
       AND "physicalQty" + ${p} >= 0
       AND "reservedQty" + ${r} >= 0
       AND "physicalQty" + ${p} >= "reservedQty" + ${r}
     RETURNING "physicalQty", "reservedQty", "lowStockThreshold"`;
  if (rows.length === 0) {
    const exists = await tx.productUnit.findUnique({ where: { id: op.unitId }, select: { id: true } });
    throw new StockError(exists ? "Недостаточно доступного остатка" : "Единица товара не найдена");
  }
  const who = actor ?? (await currentActor());
  await tx.stockMovement.create({
    data: {
      productUnitId: op.unitId,
      type: op.type,
      physicalDelta: p,
      reservedDelta: r,
      physicalAfter: rows[0].physicalQty,
      reservedAfter: rows[0].reservedQty,
      userId: who.userId,
      onBehalfOfUserId: who.onBehalfOfUserId,
      reason: op.reason ?? null,
      relatedEntity: op.relatedEntity,
      relatedId: op.relatedId,
    },
  });
  const physical = Number(rows[0].physicalQty);
  const reserved = Number(rows[0].reservedQty);
  await syncLinkedUnits(tx, op.unitId);
  // П6: доступный остаток опустился ниже порога — сообщаем поставщику один раз при пересечении
  const threshold = rows[0].lowStockThreshold === null ? null : Number(rows[0].lowStockThreshold);
  const after = physical - reserved;
  const before = after - (d.physical - d.reserved);
  if (threshold !== null && before >= threshold && after < threshold) {
    const unit = await tx.productUnit.findUniqueOrThrow({ where: { id: op.unitId }, include: { product: true } });
    await notifySupplierStaff(
      unit.product.supplierId,
      { type: "stock.low", title: `Мало на складе: ${unit.product.name}`, body: `${unitName(unit)}: доступно ${formatQty(Math.max(0, after))}`, link: `/supplier/stock/${unit.id}`, entity: "ProductUnit", entityId: unit.id },
      ["OWNER", "ADMIN"],
      tx,
    );
  }
  return { physical, reserved };
}

// Строки остатков блокируются заранее и всегда в одном порядке (по id базовой единицы).
// Иначе две транзакции с несколькими товарами (корзины «вода, сок» и «сок, вода») берут
// блокировки встречно и одна из них падает с deadlock.
export async function lockStockUnits(tx: Tx, unitIds: string[]) {
  const ids = [...new Set(unitIds)];
  if (ids.length === 0) return;
  await tx.$queryRaw`
    SELECT id FROM "ProductUnit"
     WHERE id IN (SELECT COALESCE("baseUnitId", id) FROM "ProductUnit" WHERE id = ANY(${ids}::text[]))
     ORDER BY id
       FOR UPDATE`;
}

// Л4: число целых связанных единиц (коробок) из доступного остатка базовой. Строки связанных
// единиц блокируются уже после базовой — порядок блокировок всегда «база → связанные».
export async function syncLinkedUnits(tx: Tx, baseUnitId: string) {
  await tx.$executeRaw`
    UPDATE "ProductUnit" u
       SET "physicalQty" = GREATEST(0, FLOOR((b."physicalQty" - b."reservedQty") / u."baseQty")), "reservedQty" = 0, "updatedAt" = now()
      FROM "ProductUnit" b
     WHERE b.id = ${baseUnitId} AND u."baseUnitId" = b.id`;
}

export async function currentActor() {
  const auth = await getAuth();
  return {
    userId: auth?.realUser.id ?? null,
    onBehalfOfUserId: auth?.isImpersonating ? auth.user.id : null,
  };
}

export function stockOperation(op: StockOperation) {
  return db.$transaction((tx) => applyStock(tx, op));
}

// П6: единицы поставщика, у которых доступный остаток ниже порога
export async function lowStockUnitIds(supplierId: string) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT u.id FROM "ProductUnit" u JOIN "Product" p ON p.id = u."productId"
     WHERE p."supplierId" = ${supplierId} AND p."archivedAt" IS NULL AND u."isActive"
       AND u."lowStockThreshold" IS NOT NULL AND u."physicalQty" - u."reservedQty" < u."lowStockThreshold"`;
  return rows.map((r) => r.id);
}

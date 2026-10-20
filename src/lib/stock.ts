import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { StockMovementType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getAuth } from "@/lib/auth/current";
import { movementDeltas } from "./stock-core";

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
  const d = movementDeltas(op.type, op.qty);
  const p = new Prisma.Decimal(d.physical);
  const r = new Prisma.Decimal(d.reserved);
  const rows = await tx.$queryRaw<{ physicalQty: Prisma.Decimal; reservedQty: Prisma.Decimal }[]>`
    UPDATE "ProductUnit"
       SET "physicalQty" = "physicalQty" + ${p}, "reservedQty" = "reservedQty" + ${r}, "updatedAt" = now()
     WHERE id = ${op.unitId}
       AND "physicalQty" + ${p} >= 0
       AND "reservedQty" + ${r} >= 0
       AND "physicalQty" + ${p} >= "reservedQty" + ${r}
     RETURNING "physicalQty", "reservedQty"`;
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
  return { physical: Number(rows[0].physicalQty), reserved: Number(rows[0].reservedQty) };
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

import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { formatSku } from "./sku-core";

type Tx = Prisma.TransactionClient | typeof db;

// Следующий свободный артикул поставщика. Счётчик увеличивается атомарно (одновременные создания
// получают разные номера); номер, который поставщик уже занял вручную, пропускается.
export async function nextSku(tx: Tx, supplierId: string): Promise<string> {
  for (let i = 0; i < 1000; i++) {
    const { skuSeq } = await tx.supplier.update({ where: { id: supplierId }, data: { skuSeq: { increment: 1 } }, select: { skuSeq: true } });
    const sku = formatSku(skuSeq);
    const taken = await tx.product.findFirst({ where: { supplierId, sku: { equals: sku, mode: "insensitive" } }, select: { id: true } });
    if (!taken) return sku;
  }
  throw new Error("Не удалось подобрать свободный артикул");
}

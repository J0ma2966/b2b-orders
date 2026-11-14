import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { notifySuperAdmins, notifySupplierStaff } from "@/lib/notify";
import { isSuspiciousDrop, priceChangePct } from "./stock-core";
import { currentActor } from "./stock";

type Tx = Prisma.TransactionClient;

// Изменение цены единицы: история цен и антифрод-проверка (ТЗ п. 16, 54).
// Уже оформленные заказы хранят свою цену и не пересчитываются.
export async function changeUnitPrice(
  tx: Tx,
  unit: { id: string; price: Prisma.Decimal | null; product: { name: string; supplierId: string } },
  newPrice: number | null,
) {
  const old = unit.price === null ? null : Number(unit.price);
  if (old === newPrice) return null;
  const actor = await currentActor();
  await tx.productUnit.update({ where: { id: unit.id }, data: { price: newPrice } });
  await tx.priceHistory.create({ data: { productUnitId: unit.id, oldPrice: old, newPrice, userId: actor.userId } });
  // Снижение сравнивается не только с прежней ценой, но и с самой высокой за последние 30 дней (после
  // последнего предупреждения по этой единице): иначе проверку обходили, стерев цену и поставив новую,
  // или снижая её шагами меньше 30%
  const ref = newPrice === null ? old : await referencePrice(tx, unit.id, old);
  if (isSuspiciousDrop(ref, newPrice)) {
    const pct = priceChangePct(ref!, newPrice!);
    const event = await tx.antifraudEvent.create({
      data: {
        supplierId: unit.product.supplierId,
        productUnitId: unit.id,
        oldPrice: ref!,
        newPrice: newPrice!,
        changePct: pct,
        userId: actor.userId,
        onBehalfOfUserId: actor.onBehalfOfUserId,
      },
    });
    const n = {
      type: "antifraud.price",
      title: `Снижение цены на ${Math.abs(pct)}%`,
      body: `${unit.product.name}: ${ref} → ${newPrice}`,
      entity: "AntifraudEvent",
      entityId: event.id,
    };
    await notifySuperAdmins({ ...n, link: `/admin/antifraud` }, tx);
    await notifySupplierStaff(unit.product.supplierId, { ...n, link: `/supplier/catalog` }, ["OWNER", "ADMIN"], tx);
  }
  return { old, new: newPrice };
}

const REFERENCE_DAYS = 30;

async function referencePrice(tx: Tx, unitId: string, old: number | null) {
  const lastEvent = await tx.antifraudEvent.findFirst({ where: { productUnitId: unitId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const monthAgo = new Date(Date.now() - REFERENCE_DAYS * 24 * 3600_000);
  const since = lastEvent && lastEvent.createdAt > monthAgo ? lastEvent.createdAt : monthAgo;
  const history = await tx.priceHistory.findMany({ where: { productUnitId: unitId, createdAt: { gte: since } }, select: { oldPrice: true, newPrice: true } });
  const prices = [old, ...history.flatMap((h) => [h.oldPrice, h.newPrice])].filter((p): p is NonNullable<typeof p> => p !== null).map(Number);
  return prices.length ? Math.max(...prices) : null;
}

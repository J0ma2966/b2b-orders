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
  if (isSuspiciousDrop(old, newPrice)) {
    const pct = priceChangePct(old!, newPrice!);
    const event = await tx.antifraudEvent.create({
      data: {
        supplierId: unit.product.supplierId,
        productUnitId: unit.id,
        oldPrice: old!,
        newPrice: newPrice!,
        changePct: pct,
        userId: actor.userId,
        onBehalfOfUserId: actor.onBehalfOfUserId,
      },
    });
    const n = {
      type: "antifraud.price",
      title: `Снижение цены на ${Math.abs(pct)}%`,
      body: `${unit.product.name}: ${old} → ${newPrice}`,
      entity: "AntifraudEvent",
      entityId: event.id,
    };
    await notifySuperAdmins({ ...n, link: `/admin/antifraud` }, tx);
    await notifySupplierStaff(unit.product.supplierId, { ...n, link: `/supplier/catalog` }, ["OWNER", "ADMIN"], tx);
  }
  return { old, new: newPrice };
}

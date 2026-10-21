import "server-only";
import { db } from "@/lib/db";
import { applyStock, currentActor, syncLinkedUnits } from "@/lib/stock";
import { formatQty, unitName } from "@/lib/catalog";
import { CLOSED } from "@/lib/order-core";
import { OrderError } from "@/lib/orders";

// Л4: «коробка = N шт.» — одна единица товара считается в другой. Остаток ведётся только в базовой.

// Пока по единице есть резерв (заказы в работе, согласованные замены), соотношение менять нельзя:
// резерв снимался бы в другом пересчёте, чем ставился.
async function hasOpenReservations(unitId: string, client: typeof db | Parameters<Parameters<typeof db.$transaction>[0]>[0]) {
  const [items, replacements] = await Promise.all([
    client.orderItem.count({ where: { productUnitId: unitId, order: { status: { notIn: ["DRAFT", ...CLOSED] } } } }),
    client.replacement.count({ where: { productUnitId: unitId, status: { in: ["APPROVED", "ASSIGNED"] } } }),
  ]);
  return items + replacements > 0;
}

export async function setUnitLink(supplierId: string, unitId: string, link: { baseUnitId: string; ratio: number } | null) {
  if (link && (!Number.isFinite(link.ratio) || link.ratio <= 0 || link.ratio > 100_000)) throw new OrderError("Сколько базовых единиц в одной — число больше нуля");
  const actor = await currentActor();
  return db.$transaction(async (tx) => {
    const unit = await tx.productUnit.findUnique({ where: { id: unitId }, include: { product: { include: { units: true } } } });
    if (!unit || unit.product.supplierId !== supplierId) throw new OrderError("Единица не найдена");
    const base = link ? unit.product.units.find((u) => u.id === link.baseUnitId) : null;
    if (link && (!base || base.id === unit.id)) throw new OrderError("Базовая единица должна быть другой единицей этого товара");
    if (base?.baseUnitId) throw new OrderError("Базовая единица сама считается в другой — выберите её основу");
    if (link && unit.product.units.some((u) => u.baseUnitId === unit.id)) throw new OrderError("В этой единице уже считаются другие — сначала отвяжите их");
    const same = link ? unit.baseUnitId === link.baseUnitId && Number(unit.baseQty) === link.ratio : unit.baseUnitId === null;
    if (same) return { changed: false };
    // Блокировки в порядке «база → связанная», как при складских операциях
    if (base) await tx.$queryRaw`SELECT id FROM "ProductUnit" WHERE id = ${base.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ProductUnit" WHERE id = ${unit.id} FOR UPDATE`;
    if ((unit.baseUnitId === null && Number(unit.reservedQty) > 0) || (await hasOpenReservations(unit.id, tx))) {
      throw new OrderError("По этой единице есть заказы или замены в работе. Измените соотношение, когда они закроются");
    }

    if (unit.baseUnitId === null && link && base) {
      // Свой остаток единицы переводится в базовую: 3 коробки × 24 = 72 шт.
      const own = Number(unit.physicalQty);
      if (own > 0) {
        const note = `${formatQty(own)} ${unitName(unit)} × ${formatQty(link.ratio)} → ${unitName(base)}`;
        await applyStock(tx, { unitId: unit.id, type: "ADJUSTMENT", qty: -own, reason: `Остаток переведён в базовую единицу: ${note}` }, actor);
        await applyStock(tx, { unitId: base.id, type: "INCOME", qty: Math.round(own * link.ratio * 1000) / 1000, reason: `Остаток другой единицы: ${note}` }, actor);
      }
    }
    await tx.productUnit.update({
      where: { id: unit.id },
      // Отвязанная единица начинает с нулевого остатка: товар остаётся посчитанным в базовой
      data: link ? { baseUnitId: link.baseUnitId, baseQty: link.ratio } : { baseUnitId: null, baseQty: null, physicalQty: 0, reservedQty: 0 },
    });
    if (link) await syncLinkedUnits(tx, link.baseUnitId);
    return { changed: true, before: unit.baseUnitId ? `${formatQty(Number(unit.baseQty))}` : null };
  });
}

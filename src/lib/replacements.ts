import "server-only";
import type { ReplacementStatus, ReturnedStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { applyStock, currentActor, StockError } from "@/lib/stock";
import { notifySupplierStaff, notifyUsers } from "@/lib/notify";
import { formatQty } from "@/lib/catalog";
import { notifyShop, OrderError } from "@/lib/orders";
import { validQty, RECEIVED } from "./order-core";
import { RETURNED_FINAL, RETURNED_STATUS_LABEL } from "./replacement-core";

const num = (v: { toString(): string } | null | undefined) => (v == null ? 0 : Number(v.toString()));
const ACTIVE: ReplacementStatus[] = ["NEW", "APPROVED", "ASSIGNED", "DONE"];

// Сколько ещё можно заявить на замену по позиции: принято минус уже заявленное.
export async function replaceableQty(orderItemId: string) {
  const item = await db.orderItem.findUnique({ where: { id: orderItemId } });
  if (!item) return 0;
  const used = await db.replacement.aggregate({ where: { orderItemId, status: { in: ACTIVE } }, _sum: { qty: true } });
  return num(item.acceptedQty) - num(used._sum.qty);
}

export type NewReplacement = { orderId: string; orderItemId: string; qty: number; reason: string; comment?: string | null; photoPaths: string[]; videoPaths: string[] };

export async function createReplacement(shopId: string, input: NewReplacement) {
  const actor = await currentActor();
  const order = await db.order.findUnique({ where: { id: input.orderId }, include: { items: { include: { productUnit: { include: { product: true } } } } } });
  if (!order || order.shopId !== shopId || !RECEIVED.includes(order.status)) throw new OrderError("Заказ не найден или ещё не получен");
  const item = order.items.find((i) => i.id === input.orderItemId);
  if (!item) throw new OrderError("Позиция не найдена");
  if (!item.productUnit.product.allowReplacement) throw new OrderError("Поставщик не принимает замену этого товара");
  if (!validQty(item.productUnit.kind, input.qty)) throw new OrderError("Неверное количество");
  const left = await replaceableQty(item.id);
  if (input.qty > left) throw new OrderError(left > 0 ? `Можно заменить не больше ${formatQty(left)} ${item.unitLabel}` : "По этой позиции замена уже заявлена");
  const r = await db.replacement.create({
    data: {
      shopId,
      supplierId: order.supplierId,
      orderId: order.id,
      orderItemId: item.id,
      productUnitId: item.productUnitId,
      productName: item.productName,
      unitLabel: item.unitLabel,
      qty: input.qty,
      reason: input.reason,
      comment: input.comment ?? null,
      photoPaths: input.photoPaths,
      videoPaths: input.videoPaths,
      createdByUserId: actor.userId,
    },
  });
  await notifySupplierStaff(order.supplierId, {
    type: "replacement.new",
    title: `Заявка на замену №${r.number}`,
    body: `${item.productName} — ${formatQty(input.qty)} ${item.unitLabel}. Причина: ${input.reason}`,
    link: `/supplier/replacements/${r.id}`,
    entity: "Replacement",
    entityId: r.id,
  });
  return r;
}

async function lockReplacement(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], id: string) {
  await tx.$queryRaw`SELECT id FROM "Replacement" WHERE id = ${id} FOR UPDATE`;
  const r = await tx.replacement.findUnique({ where: { id }, include: { newOrder: true } });
  if (!r) throw new OrderError("Заявка не найдена");
  return r;
}

export async function cancelReplacement(shopId: string, id: string) {
  await db.$transaction(async (tx) => {
    const r = await lockReplacement(tx, id);
    if (r.shopId !== shopId) throw new OrderError("Заявка не найдена");
    if (r.status !== "NEW") throw new OrderError("Заявку уже рассмотрели, отменить её нельзя");
    await tx.replacement.update({ where: { id }, data: { status: "CANCELLED" } });
  });
}

// Согласование: новый товар сразу резервируется (ТЗ п. 46)
export async function decideReplacement(supplierId: string, id: string, approve: boolean, comment: string | null) {
  const actor = await currentActor();
  try {
    await db.$transaction(async (tx) => {
      const r = await lockReplacement(tx, id);
      if (r.supplierId !== supplierId) throw new OrderError("Заявка не найдена");
      if (r.status !== "NEW") throw new OrderError("Заявка уже рассмотрена");
      if (approve) {
        await applyStock(tx, { unitId: r.productUnitId, type: "RESERVE", qty: num(r.qty), reason: `Замена №${r.number}`, relatedEntity: "Replacement", relatedId: r.id }, actor);
      }
      await tx.replacement.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decisionComment: comment, decidedAt: new Date() } });
      await notifyShop(r.shopId, { type: "replacement.decision", title: `Замена №${r.number} ${approve ? "согласована" : "отклонена"}`, body: comment ?? undefined, link: `/shop/replacements`, entity: "Replacement", entityId: r.id }, tx);
    });
  } catch (e) {
    if (e instanceof StockError) throw new OrderError("Недостаточно товара на складе для замены");
    throw e;
  }
}

// Отдельное задание доставщику или привязка к новому заказу магазина
export async function assignReplacement(supplierId: string, id: string, target: { courierId?: string; orderId?: string }) {
  await db.$transaction(async (tx) => {
    const r = await lockReplacement(tx, id);
    if (r.supplierId !== supplierId) throw new OrderError("Заявка не найдена");
    if (r.status !== "APPROVED" && r.status !== "ASSIGNED") throw new OrderError("Назначить можно только согласованную замену");
    if (target.orderId) {
      const order = await tx.order.findUnique({ where: { id: target.orderId } });
      if (!order || order.supplierId !== supplierId || order.shopId !== r.shopId || !["PLACED", "ACCEPTED", "ASSEMBLING", "READY", "ASSIGNED"].includes(order.status)) {
        throw new OrderError("Заказ для привязки не найден");
      }
      await tx.replacement.update({ where: { id }, data: { newOrderId: order.id, courierId: order.courierId, status: order.courierId ? "ASSIGNED" : "APPROVED", assignedAt: order.courierId ? new Date() : null } });
      if (order.courierId) await notifyUsers([order.courierId], { type: "replacement.assigned", title: `Замена №${r.number} вместе с заказом №${order.number}`, link: "/courier/replacements", entity: "Replacement", entityId: r.id }, tx);
      return;
    }
    const courier = await tx.supplierMember.findFirst({ where: { supplierId, userId: target.courierId ?? "", role: "COURIER", isActive: true } });
    if (!courier) throw new OrderError("Доставщик не найден");
    await tx.replacement.update({ where: { id }, data: { courierId: courier.userId, newOrderId: null, status: "ASSIGNED", assignedAt: new Date() } });
    await notifyUsers([courier.userId], { type: "replacement.assigned", title: `Новое задание: замена №${r.number}`, link: "/courier/replacements", entity: "Replacement", entityId: r.id }, tx);
    await notifyShop(r.shopId, { type: "replacement.assigned", title: `Замена №${r.number} передана доставщику`, link: "/shop/replacements", entity: "Replacement", entityId: r.id }, tx);
  });
}

// Доставщик выполняет: передал новый товар и забрал старый (ТЗ п. 47–48)
export async function completeReplacement(courierId: string, id: string, comment: string | null, photoPaths: string[]) {
  const actor = await currentActor();
  await db.$transaction(async (tx) => {
    const r = await lockReplacement(tx, id);
    const mine = r.courierId === courierId || r.newOrder?.courierId === courierId;
    if (!mine) throw new OrderError("Задание не найдено");
    if (r.status !== "ASSIGNED" && !(r.status === "APPROVED" && r.newOrder?.courierId === courierId)) throw new OrderError("Задание недоступно");
    const qty = num(r.qty);
    const rel = { relatedEntity: "Replacement", relatedId: r.id };
    await applyStock(tx, { unitId: r.productUnitId, type: "REPLACEMENT_OUT", qty, reason: `Замена №${r.number}: передано магазину`, ...rel }, actor);
    const returned = await tx.returnedItem.create({
      data: {
        supplierId: r.supplierId,
        shopId: r.shopId,
        orderId: r.orderId,
        replacementId: r.id,
        productUnitId: r.productUnitId,
        productName: r.productName,
        unitLabel: r.unitLabel,
        qty,
        reason: r.reason,
        courierId,
        comment,
        photoPaths: [...r.photoPaths, ...photoPaths],
        videoPaths: r.videoPaths,
      },
    });
    // Забранный товар — в «Возвращённые», основной остаток не меняется (запись в журнале для истории)
    await applyStock(tx, { unitId: r.productUnitId, type: "TO_RETURNED", qty, reason: `Замена №${r.number}: забрано у магазина`, relatedEntity: "ReturnedItem", relatedId: returned.id }, actor);
    await tx.replacement.update({ where: { id }, data: { status: "DONE", courierId, completedAt: new Date() } });
    await notifyShop(r.shopId, { type: "replacement.done", title: `Замена №${r.number} выполнена`, link: "/shop/replacements", entity: "Replacement", entityId: r.id }, tx);
    await notifySupplierStaff(r.supplierId, { type: "replacement.done", title: `Замена №${r.number} выполнена, товар в «Возвращённых»`, link: "/supplier/returned", entity: "ReturnedItem", entityId: returned.id }, ["OWNER", "ADMIN"], tx);
  });
}

// Статусы возвращённых товаров (ТЗ п. 49); возврат в оборот — отдельная складская операция
export async function setReturnedStatus(supplierId: string, id: string, status: ReturnedStatus, comment: string | null) {
  const actor = await currentActor();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ReturnedItem" WHERE id = ${id} FOR UPDATE`;
    const item = await tx.returnedItem.findUnique({ where: { id } });
    if (!item || item.supplierId !== supplierId) throw new OrderError("Товар не найден");
    if (RETURNED_FINAL.includes(item.status)) throw new OrderError(`Статус «${RETURNED_STATUS_LABEL[item.status]}» окончательный`);
    if (item.status === status) return item;
    if (status === "BACK_TO_STOCK") {
      await applyStock(tx, { unitId: item.productUnitId, type: "BACK_TO_STOCK", qty: num(item.qty), reason: comment ?? "Возврат в оборот", relatedEntity: "ReturnedItem", relatedId: item.id }, actor);
    }
    await tx.returnedItem.update({ where: { id }, data: { status, comment: comment ?? item.comment } });
    return item;
  });
}

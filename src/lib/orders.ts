import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { CancelSide, Order, OrderStatus, PaymentMethod } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { applyStock, currentActor, StockError } from "@/lib/stock";
import { notifySupplierStaff, notifyUsers, type NotificationInput } from "@/lib/notify";
import { supplierForShop } from "@/lib/shop-catalog";
import { formatQty, unitName } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { generateQrToken } from "@/lib/qr-token";
import {
  canAssignCourier,
  canEditForced,
  orderTotal,
  ORDER_STATUS_LABEL,
  planBonuses,
  shopCanCancel,
  supplierOrderTransition,
  validQty,
  type SupplierOrderAction,
} from "./order-core";

type Tx = Prisma.TransactionClient;
type Actor = { userId: string | null; onBehalfOfUserId: string | null };

export class OrderError extends Error {}

const num = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

export function orderTitle(o: Pick<Order, "number">) {
  return o.number ? `Заказ №${o.number}` : "Корзина";
}

// ───────────── Общее ─────────────

export async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new OrderError("Заказ не найден");
  return order;
}

export async function addEvent(
  tx: Tx,
  orderId: string,
  e: { type: string; from?: OrderStatus; to?: OrderStatus; comment?: string | null; data?: Prisma.InputJsonValue; actorRole: string },
  actor: Actor,
) {
  await tx.orderEvent.create({
    data: {
      orderId,
      type: e.type,
      fromStatus: e.from,
      toStatus: e.to,
      comment: e.comment ?? null,
      data: e.data,
      actorRole: actor.onBehalfOfUserId ? `SUPER_ADMIN→${e.actorRole}` : e.actorRole,
      userId: actor.userId,
      onBehalfOfUserId: actor.onBehalfOfUserId,
    },
  });
}

export async function notifyShop(shopId: string, n: NotificationInput, tx: Tx | typeof db = db) {
  const members = await tx.shopMember.findMany({ where: { shopId, isActive: true }, select: { userId: true } });
  await notifyUsers(members.map((m) => m.userId), n, tx);
}

// Освобождает резерв по всем позициям заказа (отмена, отклонение).
export async function releaseAll(tx: Tx, order: { id: string; items: { productUnitId: string; qty: Prisma.Decimal }[] }, actor: Actor, reason: string) {
  for (const item of order.items) {
    await applyStock(tx, { unitId: item.productUnitId, type: "RELEASE", qty: num(item.qty), reason, relatedEntity: "Order", relatedId: order.id }, actor);
  }
}

async function recalcTotal(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  const total = orderTotal(items.map((i) => ({ kind: i.kind, price: num(i.price), qty: num(i.qty) })));
  await tx.order.update({ where: { id: orderId }, data: { total } });
  return total;
}

export async function defaultCommissionRate(tx: Tx | typeof db = db) {
  const s = await tx.platformSetting.findUnique({ where: { key: "defaultCommissionRate" } });
  const v = Number(s?.value ?? 0);
  return Number.isFinite(v) ? v : 0;
}

// ───────────── Корзина (ТЗ п. 21) ─────────────

export async function findCart(shopId: string, supplierId: string) {
  return db.order.findFirst({ where: { shopId, supplierId, status: "DRAFT" } });
}

async function getOrCreateCart(shopId: string, supplierId: string, userId: string | null) {
  const existing = await findCart(shopId, supplierId);
  if (existing) return existing;
  try {
    return await db.order.create({ data: { shopId, supplierId, createdByUserId: userId } });
  } catch (e) {
    // Параллельное добавление уже создало корзину
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await findCart(shopId, supplierId);
      if (again) return again;
    }
    throw e;
  }
}

async function orderableUnit(unitId: string, supplierId: string) {
  const unit = await db.productUnit.findUnique({ where: { id: unitId }, include: { product: true } });
  if (
    !unit ||
    unit.product.supplierId !== supplierId ||
    !unit.isActive ||
    unit.price === null ||
    unit.product.archivedAt ||
    !unit.product.isAvailable
  ) {
    return null;
  }
  return unit;
}

export async function addToCart(shop: { id: string; territoryId: string; isBlocked: boolean }, supplierId: string, unitId: string, qty: number) {
  if (shop.isBlocked) throw new OrderError("Магазин заблокирован, заказы недоступны");
  const supplier = await supplierForShop(shop.territoryId, supplierId);
  if (!supplier) throw new OrderError("Поставщик недоступен");
  const unit = await orderableUnit(unitId, supplierId);
  if (!unit) throw new OrderError("Товар недоступен для заказа");
  if (!validQty(unit.kind, qty)) throw new OrderError("Неверное количество");
  const actor = await currentActor();
  const cart = await getOrCreateCart(shop.id, supplierId, actor.userId);
  const existing = await db.orderItem.findFirst({ where: { orderId: cart.id, productUnitId: unit.id } });
  const newQty = num(existing?.qty) + qty;
  const available = num(unit.physicalQty) - num(unit.reservedQty);
  if (newQty > available) {
    throw new OrderError(available > 0 ? `Доступно только ${formatQty(available)} ${unitName(unit)}` : "Товара нет в наличии");
  }
  if (existing) {
    await db.orderItem.update({ where: { id: existing.id }, data: { qty: newQty, price: unit.price! } });
  } else {
    await db.orderItem.create({
      data: {
        orderId: cart.id,
        productUnitId: unit.id,
        productName: unit.product.name,
        unitLabel: unitName(unit),
        price: unit.price!,
        qty,
        addedByUserId: actor.userId,
      },
    });
  }
  await db.$transaction((tx) => recalcTotal(tx, cart.id));
  return { cartId: cart.id, qty: newQty };
}

export async function setCartQty(shopId: string, itemId: string, qty: number) {
  const item = await db.orderItem.findUnique({ where: { id: itemId }, include: { order: true, productUnit: true } });
  if (!item || item.order.shopId !== shopId || item.order.status !== "DRAFT") throw new OrderError("Позиция не найдена");
  if (qty === 0) {
    await db.orderItem.delete({ where: { id: item.id } });
  } else {
    if (!validQty(item.productUnit.kind, qty)) throw new OrderError("Неверное количество");
    const available = num(item.productUnit.physicalQty) - num(item.productUnit.reservedQty);
    if (qty > available) throw new OrderError(`Доступно только ${formatQty(Math.max(0, available))} ${item.unitLabel}`);
    await db.orderItem.update({ where: { id: item.id }, data: { qty } });
  }
  await db.$transaction((tx) => recalcTotal(tx, item.orderId));
}

// Приводит корзину к актуальному состоянию каталога и остатков (ТЗ п. 22).
// Возвращает список того, что изменилось; пустой список — корзину можно оформлять.
async function refreshCart(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId }, include: { productUnit: { include: { product: true } } }, orderBy: { createdAt: "asc" } });
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const changes: string[] = [];
  for (const item of items) {
    const u = item.productUnit;
    const name = `«${item.productName}» (${item.unitLabel})`;
    if (!u.isActive || u.price === null || u.product.archivedAt || !u.product.isAvailable || u.product.supplierId !== order.supplierId) {
      await tx.orderItem.delete({ where: { id: item.id } });
      changes.push(`${name} больше не продаётся и убран из корзины`);
      continue;
    }
    const data: Prisma.OrderItemUpdateInput = {};
    if (!u.price.equals(item.price)) {
      data.price = u.price;
      changes.push(`Цена ${name} изменилась: ${formatMoney(item.price)} → ${formatMoney(u.price)}`);
    }
    if (item.productName !== u.product.name || item.unitLabel !== unitName(u)) {
      data.productName = u.product.name;
      data.unitLabel = unitName(u);
    }
    const available = num(u.physicalQty) - num(u.reservedQty);
    const fit = validQty(u.kind, available) ? available : Math.floor(available);
    if (fit <= 0) {
      await tx.orderItem.delete({ where: { id: item.id } });
      changes.push(`${name} закончился и убран из корзины`);
      continue;
    }
    if (num(item.qty) > fit) {
      data.qty = fit;
      changes.push(`${name}: осталось ${formatQty(fit)}, количество уменьшено`);
    }
    if (Object.keys(data).length > 0) await tx.orderItem.update({ where: { id: item.id }, data });
  }
  await recalcTotal(tx, orderId);
  return changes;
}

export type CheckoutInput = {
  paymentMethod: PaymentMethod;
  comment?: string;
  deliveryAddress: string;
  contactName: string;
  contactPhone: string;
  deliveryDate?: Date | null;
};

export type CheckoutResult =
  | { placed: true; orderId: string; number: number; bonusNotes: string[] }
  | { placed: false; changes: string[] };

async function activePromotions(tx: Tx, supplierId: string, now: Date) {
  const list = await tx.bonusPromotion.findMany({
    where: { supplierId, isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    orderBy: { createdAt: "asc" },
  });
  return list.map((p) => ({ ...p, triggerQty: num(p.triggerQty), giftQty: num(p.giftQty) }));
}

// Предварительный расчёт подарков для корзины (что увидит магазин до оформления).
export async function previewBonuses(supplierId: string, items: { productUnitId: string; qty: Prisma.Decimal }[]) {
  const now = new Date();
  const promos = await activePromotions(db as unknown as Tx, supplierId, now);
  if (promos.length === 0) return [];
  const bought = new Map<string, number>();
  for (const i of items) bought.set(i.productUnitId, (bought.get(i.productUnitId) ?? 0) + num(i.qty));
  const giftUnits = await db.productUnit.findMany({ where: { id: { in: promos.map((p) => p.giftUnitId) } }, include: { product: true } });
  const available = new Map(giftUnits.map((u) => [u.id, num(u.physicalQty) - num(u.reservedQty) - (bought.get(u.id) ?? 0)]));
  const byId = new Map(giftUnits.map((u) => [u.id, u]));
  return planBonuses(promos, bought, available, now).map((p) => {
    const u = byId.get(p.giftUnitId)!;
    return { ...p, name: u.product.name, unitLabel: unitName(u), promotion: promos.find((x) => x.id === p.promotionId)!.name };
  });
}

// Оформление: повторная проверка, резерв, бонусы, фиксация цены и комиссии (ТЗ п. 19, 22, 25, 51, 53).
export async function checkout(shop: { id: string; territoryId: string; isBlocked: boolean }, supplierId: string, input: CheckoutInput): Promise<CheckoutResult> {
  if (shop.isBlocked) throw new OrderError("Магазин заблокирован, заказы недоступны");
  const supplier = await supplierForShop(shop.territoryId, supplierId);
  if (!supplier) throw new OrderError("Поставщик недоступен для вашей территории");
  if (supplier.ordersDisabled) throw new OrderError("Поставщик временно не принимает заказы");
  const cart = await findCart(shop.id, supplierId);
  if (!cart) throw new OrderError("Корзина пуста");
  const actor = await currentActor();

  // Две попытки: если остаток увели между проверкой и резервом, корзина обновится и вернётся магазину
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const order = await lockOrder(tx, cart.id);
        if (order.status !== "DRAFT") throw new OrderError("Заказ уже оформлен");
        const changes = await refreshCart(tx, order.id);
        if (changes.length > 0) return { placed: false as const, changes };
        const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
        if (items.length === 0) throw new OrderError("Корзина пуста");

        for (const item of items) {
          await applyStock(tx, { unitId: item.productUnitId, type: "RESERVE", qty: num(item.qty), reason: "Оформление заказа", relatedEntity: "Order", relatedId: order.id }, actor);
        }

        // Бонусы — после резерва основных позиций, только из оставшегося доступного остатка
        const now = new Date();
        const promos = await activePromotions(tx, supplierId, now);
        const bonusNotes: string[] = [];
        if (promos.length > 0) {
          const bought = new Map<string, number>();
          for (const i of items) bought.set(i.productUnitId, (bought.get(i.productUnitId) ?? 0) + num(i.qty));
          const giftUnits = await tx.productUnit.findMany({ where: { id: { in: promos.map((p) => p.giftUnitId) }, isActive: true }, include: { product: true } });
          const available = new Map(giftUnits.filter((u) => !u.product.archivedAt).map((u) => [u.id, num(u.physicalQty) - num(u.reservedQty)]));
          for (const b of planBonuses(promos, bought, available, now)) {
            const u = giftUnits.find((g) => g.id === b.giftUnitId);
            if (!u) continue;
            const label = `«${u.product.name}» (${unitName(u)})`;
            if (b.qty > 0) {
              await applyStock(tx, { unitId: u.id, type: "RESERVE", qty: b.qty, reason: "Бонус по акции", relatedEntity: "Order", relatedId: order.id }, actor);
              await tx.orderItem.create({
                data: { orderId: order.id, productUnitId: u.id, kind: "BONUS", productName: u.product.name, unitLabel: unitName(u), price: 0, qty: b.qty, bonusPromotionId: b.promotionId, addedByUserId: actor.userId },
              });
            }
            if (b.qty < b.entitled) {
              bonusNotes.push(b.qty > 0 ? `Бонус ${label} выдан частично: ${formatQty(b.qty)} из ${formatQty(b.entitled)}, подарка больше нет в наличии` : `Бонус ${label} не выдан: подарка нет в наличии`);
            }
          }
        }

        const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_number_seq')`;
        const number = Number(nextval);
        const sup = await tx.supplier.findUniqueOrThrow({ where: { id: supplierId } });
        const rate = sup.commissionRate !== null ? num(sup.commissionRate) : await defaultCommissionRate(tx);
        const shopRow = await tx.shop.findUniqueOrThrow({ where: { id: shop.id } });
        const total = await recalcTotal(tx, order.id);
        await tx.order.update({
          where: { id: order.id },
          data: {
            number,
            status: "PLACED",
            placedAt: now,
            paymentMethod: input.paymentMethod,
            comment: input.comment || null,
            deliveryAddress: input.deliveryAddress,
            deliveryLat: shopRow.lat,
            deliveryLng: shopRow.lng,
            contactName: input.contactName,
            contactPhone: input.contactPhone,
            deliveryDate: input.deliveryDate ?? null,
            commissionRate: rate,
            createdByUserId: actor.userId,
            qrToken: generateQrToken(),
          },
        });
        await addEvent(tx, order.id, { type: "status", from: "DRAFT", to: "PLACED", actorRole: "SHOP", comment: bonusNotes.join("\n") || null }, actor);
        await notifySupplierStaff(supplierId, {
          type: "order.new",
          title: `Новый заказ №${number}`,
          body: `${shopRow.name}, ${formatMoney(total)}`,
          link: `/supplier/orders/${order.id}`,
          entity: "Order",
          entityId: order.id,
        }, ["OWNER", "ADMIN"], tx);
        return { placed: true as const, orderId: order.id, number, bonusNotes };
      });
    } catch (e) {
      if (e instanceof StockError && attempt === 0) continue;
      if (e instanceof StockError) throw new OrderError("Остатки изменились, проверьте корзину ещё раз");
      throw e;
    }
  }
  throw new OrderError("Не удалось оформить заказ");
}

// ───────────── Действия поставщика (ТЗ п. 26, 28, 29) ─────────────

export function shopNote(order: { id: string; number: number | null }, title: string, body?: string): NotificationInput {
  return { type: "order.status", title: `Заказ №${order.number}: ${title}`, body, link: `/shop/orders/${order.id}`, entity: "Order", entityId: order.id };
}

export async function supplierOrderAction(supplierId: string, orderId: string, action: SupplierOrderAction, reason: string | null, actorRole: string) {
  const actor = await currentActor();
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.supplierId !== supplierId || order.status === "DRAFT") throw new OrderError("Заказ не найден");
    const to = supplierOrderTransition(action, order.status);
    if (!to) throw new OrderError(`Действие недоступно в статусе «${ORDER_STATUS_LABEL[order.status]}»`);
    const now = new Date();
    const data: Prisma.OrderUpdateInput = { status: to };
    if (action === "accept") data.acceptedAt = now;
    if (action === "reject" || action === "cancel") {
      await releaseAll(tx, order, actor, action === "reject" ? "Заказ отклонён поставщиком" : "Заказ отменён поставщиком");
      Object.assign(data, { cancelledAt: now, cancelledBy: "SUPPLIER" satisfies CancelSide, cancelReason: reason });
    }
    await tx.order.update({ where: { id: order.id }, data });
    await addEvent(tx, order.id, { type: "status", from: order.status, to, comment: reason, actorRole }, actor);
    await notifyShop(order.shopId, shopNote(order, ORDER_STATUS_LABEL[to].toLowerCase(), reason ?? undefined), tx);
    if (order.courierId && (action === "cancel")) {
      await notifyUsers([order.courierId], { type: "order.cancelled", title: `Заказ №${order.number} отменён`, body: reason ?? undefined, link: `/courier`, entity: "Order", entityId: order.id }, tx);
    }
    return to;
  });
}

export async function cancelByShop(shopId: string, orderId: string, reason: string) {
  const actor = await currentActor();
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.shopId !== shopId || order.status === "DRAFT") throw new OrderError("Заказ не найден");
    if (!shopCanCancel(order.status)) throw new OrderError("Заказ уже в доставке, отменить его можно только по согласованию с поставщиком");
    await releaseAll(tx, order, actor, "Заказ отменён магазином");
    await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED_BY_SHOP", cancelledAt: new Date(), cancelledBy: "SHOP", cancelReason: reason } });
    await addEvent(tx, order.id, { type: "status", from: order.status, to: "CANCELLED_BY_SHOP", comment: reason, actorRole: "SHOP" }, actor);
    const n = { type: "order.cancelled", title: `Заказ №${order.number} отменён магазином`, body: reason, entity: "Order", entityId: order.id };
    await notifySupplierStaff(order.supplierId, { ...n, link: `/supplier/orders/${order.id}` }, ["OWNER", "ADMIN"], tx);
    if (order.courierId) await notifyUsers([order.courierId], { ...n, link: "/courier" }, tx);
  });
}

export async function assignCourier(supplierId: string, orderId: string, courierUserId: string | null, actorRole: string) {
  const actor = await currentActor();
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.supplierId !== supplierId) throw new OrderError("Заказ не найден");
    if (!canAssignCourier(order.status)) throw new OrderError("Доставщика можно назначить, когда заказ готов к доставке");
    if (courierUserId === null) {
      if (order.status !== "ASSIGNED") return;
      await tx.order.update({ where: { id: order.id }, data: { status: "READY", courierId: null, assignedAt: null } });
      await addEvent(tx, order.id, { type: "courier.unassigned", from: "ASSIGNED", to: "READY", actorRole }, actor);
      if (order.courierId) await notifyUsers([order.courierId], { type: "order.unassigned", title: `Заказ №${order.number} снят с вас`, link: "/courier", entity: "Order", entityId: order.id }, tx);
      return;
    }
    const courier = await tx.supplierMember.findFirst({ where: { supplierId, userId: courierUserId, role: "COURIER", isActive: true }, include: { user: true } });
    if (!courier) throw new OrderError("Доставщик не найден");
    if (order.courierId === courierUserId) return;
    await tx.order.update({ where: { id: order.id }, data: { status: "ASSIGNED", courierId: courierUserId, assignedAt: new Date() } });
    await addEvent(tx, order.id, { type: "courier.assigned", from: order.status, to: "ASSIGNED", actorRole, data: { courierId: courierUserId, courierName: courier.user.fullName, previousCourierId: order.courierId } }, actor);
    await notifyUsers([courierUserId], { type: "order.assigned", title: `Вам назначен заказ №${order.number}`, link: "/courier", entity: "Order", entityId: order.id }, tx);
    if (order.courierId) await notifyUsers([order.courierId], { type: "order.unassigned", title: `Заказ №${order.number} передан другому доставщику`, link: "/courier", entity: "Order", entityId: order.id }, tx);
    if (order.status !== "ASSIGNED") await notifyShop(order.shopId, shopNote(order, "назначен доставщик", courier.user.fullName), tx);
  });
}

// Принудительная продажа (ТЗ п. 24): отдельная позиция, сразу резервируется.
export async function addForcedItem(supplierId: string, orderId: string, unitId: string, qty: number, actorRole: string) {
  const actor = await currentActor();
  const unit = await orderableUnit(unitId, supplierId);
  if (!unit) throw new OrderError("Товар недоступен для продажи");
  if (!validQty(unit.kind, qty)) throw new OrderError("Неверное количество");
  try {
    await db.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (order.supplierId !== supplierId) throw new OrderError("Заказ не найден");
      if (!canEditForced(order.status)) throw new OrderError("Позиции можно добавлять до передачи заказа доставщику");
      await applyStock(tx, { unitId: unit.id, type: "RESERVE", qty, reason: "Принудительная продажа", relatedEntity: "Order", relatedId: order.id }, actor);
      const item = await tx.orderItem.create({
        data: { orderId: order.id, productUnitId: unit.id, kind: "FORCED", productName: unit.product.name, unitLabel: unitName(unit), price: unit.price!, qty, addedByUserId: actor.userId },
      });
      const total = await recalcTotal(tx, order.id);
      await addEvent(tx, order.id, { type: "item.forced_added", actorRole, data: { itemId: item.id, name: item.productName, unit: item.unitLabel, qty, price: num(unit.price) } }, actor);
      await notifyShop(order.shopId, shopNote(order, "добавлена позиция", `${unit.product.name} — ${formatQty(qty)} ${unitName(unit)}, сумма заказа ${formatMoney(total)}`), tx);
    });
  } catch (e) {
    if (e instanceof StockError) throw new OrderError("Недостаточно доступного остатка");
    throw e;
  }
}

export async function removeForcedItem(supplierId: string, itemId: string, actorRole: string) {
  const actor = await currentActor();
  const found = await db.orderItem.findUnique({ where: { id: itemId } });
  if (!found) throw new OrderError("Позиция не найдена");
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, found.orderId);
    const item = order.items.find((i) => i.id === itemId);
    if (order.supplierId !== supplierId || !item || item.kind !== "FORCED") throw new OrderError("Позиция не найдена");
    if (!canEditForced(order.status)) throw new OrderError("Позицию уже нельзя убрать");
    await applyStock(tx, { unitId: item.productUnitId, type: "RELEASE", qty: num(item.qty), reason: "Принудительная продажа убрана", relatedEntity: "Order", relatedId: order.id }, actor);
    await tx.orderItem.delete({ where: { id: item.id } });
    await recalcTotal(tx, order.id);
    await addEvent(tx, order.id, { type: "item.forced_removed", actorRole, data: { name: item.productName, unit: item.unitLabel, qty: num(item.qty) } }, actor);
    await notifyShop(order.shopId, shopNote(order, "убрана позиция", `${item.productName} — ${formatQty(item.qty)} ${item.unitLabel}`), tx);
  });
}

// История заказа с именами пользователей.
export async function orderEvents(orderId: string) {
  const events = await db.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } });
  const ids = [...new Set(events.flatMap((e) => [e.userId, e.onBehalfOfUserId]).filter((x): x is string => !!x))];
  const users = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((u) => [u.id, u]));
  // При «действии от имени» показываем, от чьего имени выполнено
  return events.map((e) => ({ ...e, user: users.get(e.onBehalfOfUserId ?? e.userId ?? "") ?? null }));
}

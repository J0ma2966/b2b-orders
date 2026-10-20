import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Вне HTTP-запроса сессии нет: действия выполняются «от системы»
vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { addForcedItem, addToCart, cancelByShop, checkout, OrderError, supplierOrderAction } from "@/lib/orders";
import { applyStock } from "@/lib/stock";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
const actor = { userId: null, onBehalfOfUserId: null };
let supplierId = "";
let territoryId = "";
let waterId = "";
let giftId = "";
let snackId = "";
const delivery = { paymentMethod: "CASH" as const, deliveryAddress: "ул. Тестовая, 1", contactName: "Тест", contactPhone: "+998901234567" };

async function newShop(i: number) {
  return db.shop.create({ data: { name: `Магазин ${tag}-${i}`, phone: "+998901234567", address: "-", lat: 41.3, lng: 69.2, contactName: "-", territoryId } });
}

async function unitAvail(id: string) {
  const u = await db.productUnit.findUniqueOrThrow({ where: { id } });
  return { physical: Number(u.physicalQty), reserved: Number(u.reservedQty) };
}

describe.skipIf(!enabled)("заказы: оформление, резерв, бонусы", () => {
  beforeAll(async () => {
    const t = await db.territory.create({ data: { name: `Тестовый район ${tag}`, type: "DISTRICT" } });
    territoryId = t.id;
    const supplier = await db.supplier.create({
      data: {
        legalName: "Поставщик", displayName: `Поставщик ${tag}`, inn: tag + "9", legalAddress: "-", phone: "+998900000002", email: "s@t.uz", contactPerson: "-", officeAddress: "-",
        status: "ACTIVE", commissionRate: 2.5, territories: { create: { territoryId } },
      },
    });
    supplierId = supplier.id;
    const mk = async (name: string, price: number, qty: number) => {
      const p = await db.product.create({ data: { supplierId, name, units: { create: { kind: "PIECE", price } } }, include: { units: true } });
      await db.$transaction((tx) => applyStock(tx, { unitId: p.units[0].id, type: "INITIAL", qty }, actor));
      return p.units[0].id;
    };
    waterId = await mk("Вода", 3000, 10);
    giftId = await mk("Стакан", 500, 1);
    snackId = await mk("Чипсы", 7000, 2);
    await db.bonusPromotion.create({
      data: { supplierId, name: "5+1", triggerUnitId: waterId, triggerQty: 5, giftUnitId: giftId, giftQty: 1, startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000) },
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("15 магазинов одновременно оформляют последние 10 штук: оформлено ровно 10", async () => {
    const shops = await Promise.all(Array.from({ length: 15 }, (_, i) => newShop(i)));
    for (const s of shops) await addToCart(s, supplierId, waterId, 1);
    const results = await Promise.all(shops.map((s) => checkout(s, supplierId, delivery)));
    const placed = results.filter((r) => r.placed);
    expect(placed).toHaveLength(10);
    // Остальным корзина обновлена и объяснено, что товар закончился
    for (const r of results.filter((r) => !r.placed)) expect(r.placed ? [] : r.changes.join()).toContain("закончился");
    expect(await unitAvail(waterId)).toEqual({ physical: 10, reserved: 10 });
    // Каждая отмена возвращает резерв
    const first = placed[0] as { orderId: string };
    const order = await db.order.findUniqueOrThrow({ where: { id: first.orderId } });
    await cancelByShop(order.shopId, order.id, "передумали");
    expect(await unitAvail(waterId)).toEqual({ physical: 10, reserved: 9 });
    // Номера заказов уникальные и выдаются только оформленным
    const numbers = await db.order.findMany({ where: { supplierId, number: { not: null } }, select: { number: true } });
    expect(new Set(numbers.map((n) => n.number)).size).toBe(10);
    // Освобождаем остаток для следующих тестов
    for (const r of placed.slice(1) as { orderId: string }[]) {
      const o = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
      await cancelByShop(o.shopId, o.id, "тест");
    }
    expect(await unitAvail(waterId)).toEqual({ physical: 10, reserved: 0 });
  });

  it("изменилась цена — заказ не оформляется, корзина обновлена; повтор оформляет по новой цене", async () => {
    const shop = await newShop(100);
    await addToCart(shop, supplierId, snackId, 2);
    await db.productUnit.update({ where: { id: snackId }, data: { price: 7500 } });
    const r1 = await checkout(shop, supplierId, delivery);
    expect(r1.placed).toBe(false);
    if (!r1.placed) expect(r1.changes[0]).toContain("Цена");
    const r2 = await checkout(shop, supplierId, delivery);
    expect(r2.placed).toBe(true);
    const order = await db.order.findUniqueOrThrow({ where: { id: (r2 as { orderId: string }).orderId }, include: { items: true } });
    expect(Number(order.total)).toBe(15000);
    expect(Number(order.commissionRate)).toBe(2.5);
    // Цена в заказе не меняется вместе с каталогом
    await db.productUnit.update({ where: { id: snackId }, data: { price: 9000 } });
    expect(Number((await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).price)).toBe(7500);
    await supplierOrderAction(supplierId, order.id, "reject", "нет машины", "SUPPLIER_ADMIN");
    expect(await unitAvail(snackId)).toEqual({ physical: 2, reserved: 0 });
  });

  it("бонус выдаётся бесплатно и не больше остатка подарка", async () => {
    const shop = await newShop(200);
    await addToCart(shop, supplierId, waterId, 10); // положено 2 стакана, в наличии 1
    const r = await checkout(shop, supplierId, delivery);
    expect(r.placed).toBe(true);
    if (!r.placed) return;
    expect(r.bonusNotes[0]).toContain("частично");
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { items: true } });
    const bonus = order.items.find((i) => i.kind === "BONUS")!;
    expect(Number(bonus.qty)).toBe(1);
    expect(Number(bonus.price)).toBe(0);
    expect(Number(order.total)).toBe(30000);
    expect(await unitAvail(giftId)).toEqual({ physical: 1, reserved: 1 });
  });

  it("принудительная продажа невозможна без остатка и резервируется при наличии", async () => {
    const order = await db.order.findFirstOrThrow({ where: { supplierId, status: "PLACED" }, orderBy: { placedAt: "desc" } });
    await expect(addForcedItem(supplierId, order.id, snackId, 3, "SUPPLIER_ADMIN")).rejects.toBeInstanceOf(OrderError);
    await addForcedItem(supplierId, order.id, snackId, 1, "SUPPLIER_ADMIN");
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(after.total)).toBe(30000 + 9000);
    expect(await unitAvail(snackId)).toEqual({ physical: 2, reserved: 1 });
    // Отмена поставщиком освобождает всё, включая бонус и принудительную позицию
    await supplierOrderAction(supplierId, order.id, "accept", null, "SUPPLIER_ADMIN");
    await supplierOrderAction(supplierId, order.id, "cancel", "склад закрыт", "SUPPLIER_ADMIN");
    expect(await unitAvail(snackId)).toEqual({ physical: 2, reserved: 0 });
    expect(await unitAvail(giftId)).toEqual({ physical: 1, reserved: 0 });
    expect(await unitAvail(waterId)).toEqual({ physical: 10, reserved: 0 });
  });

  it("недоступный поставщик и заблокированный магазин не оформляют", async () => {
    const shop = await newShop(300);
    await addToCart(shop, supplierId, waterId, 1);
    await expect(checkout({ ...shop, isBlocked: true }, supplierId, delivery)).rejects.toBeInstanceOf(OrderError);
    await db.supplier.update({ where: { id: supplierId }, data: { ordersDisabled: true } });
    await expect(checkout(shop, supplierId, delivery)).rejects.toThrow("не принимает");
    await db.supplier.update({ where: { id: supplierId }, data: { ordersDisabled: false } });
  });
});

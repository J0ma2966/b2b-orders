import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Вне HTTP-запроса сессии нет: действия выполняются «от системы»
vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { addToCart, checkout, checkoutAll, OrderError, removeCartItems, setCartQtyByUnit } from "@/lib/orders";
import { applyStock } from "@/lib/stock";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
const actor = { userId: null, onBehalfOfUserId: null };
const delivery = { paymentMethod: "CASH" as const, deliveryAddress: "ул. Тестовая, 1", contactName: "Тест", contactPhone: "+998901234567" };
let territoryId = "";
let n = 0;

async function newShop() {
  return db.shop.create({ data: { name: `Магазин выбора ${tag}-${++n}`, phone: "+998901234567", address: "-", lat: 41.3, lng: 69.2, contactName: "-", territoryId } });
}

async function newSupplier(minOrderTotal?: number) {
  const s = await db.supplier.create({
    data: {
      legalName: "Поставщик", displayName: `Поставщик выбора ${tag}-${++n}`, inn: `${tag}${n}`.slice(-9), legalAddress: "-", phone: "+998900000002", email: "s@t.uz", contactPerson: "-", officeAddress: "-",
      status: "ACTIVE", minOrderTotal, territories: { create: { territoryId } },
    },
  });
  const mk = async (name: string, price: number, qty: number) => {
    const p = await db.product.create({ data: { supplierId: s.id, name, units: { create: { kind: "PIECE", price } } }, include: { units: true } });
    await db.$transaction((tx) => applyStock(tx, { unitId: p.units[0].id, type: "INITIAL", qty }, actor));
    return p.units[0].id;
  };
  return { id: s.id, a: await mk("Товар А", 1000, 50), b: await mk("Товар Б", 2000, 50), c: await mk("Товар В", 3000, 5) };
}

const cartItems = async (shopId: string, supplierId: string) =>
  db.orderItem.findMany({ where: { order: { shopId, supplierId, status: "DRAFT" } }, orderBy: { createdAt: "asc" } });
const reserved = async (unitId: string) => Number((await db.productUnit.findUniqueOrThrow({ where: { id: unitId } })).reservedQty);

describe.skipIf(!enabled)("корзина: выбор товаров для оформления", () => {
  beforeAll(async () => {
    territoryId = (await db.territory.create({ data: { name: `Район выбора ${tag}`, type: "DISTRICT" } })).id;
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it("оформляются только отмеченные позиции, остальные остаются в корзине", async () => {
    const [shop, sup] = [await newShop(), await newSupplier()];
    await addToCart(shop, sup.id, sup.a, 2);
    await addToCart(shop, sup.id, sup.b, 3);
    await addToCart(shop, sup.id, sup.c, 1);
    const before = await cartItems(shop.id, sup.id);
    const pick = before.filter((i) => i.productUnitId !== sup.b).map((i) => i.id);

    const r = await checkout(shop, sup.id, delivery, pick);
    expect(r.placed).toBe(true);
    const order = await db.order.findUniqueOrThrow({ where: { id: (r as { orderId: string }).orderId }, include: { items: true } });
    expect(order.status).toBe("PLACED");
    expect(order.items.map((i) => i.productUnitId).sort()).toEqual([sup.a, sup.c].sort());
    expect(Number(order.total)).toBe(2 * 1000 + 1 * 3000);
    // Резерв — только по оформленному
    expect([await reserved(sup.a), await reserved(sup.b), await reserved(sup.c)]).toEqual([2, 0, 1]);
    // Неотмеченный товар лежит в новой корзине с тем же количеством и ценой
    const left = await cartItems(shop.id, sup.id);
    expect(left).toHaveLength(1);
    expect([left[0].productUnitId, Number(left[0].qty), Number(left[0].price)]).toEqual([sup.b, 3, 2000]);
    const draft = await db.order.findUniqueOrThrow({ where: { id: left[0].orderId } });
    expect([draft.status, Number(draft.total), draft.number]).toEqual(["DRAFT", 6000, null]);
    // Оставшееся потом оформляется как обычно
    const r2 = await checkout(shop, sup.id, delivery);
    expect(r2.placed).toBe(true);
    expect(await reserved(sup.b)).toBe(3);
  });

  it("минимальная сумма считается по отмеченным; при отказе корзина не меняется", async () => {
    const [shop, sup] = [await newShop(), await newSupplier(5000)];
    await addToCart(shop, sup.id, sup.a, 2);
    await addToCart(shop, sup.id, sup.b, 2);
    const before = await cartItems(shop.id, sup.id);
    const onlyA = before.filter((i) => i.productUnitId === sup.a).map((i) => i.id);
    await expect(checkout(shop, sup.id, delivery, onlyA)).rejects.toThrow(/Минимальная сумма/);
    const after = await cartItems(shop.id, sup.id);
    expect(after.map((i) => i.id)).toEqual(before.map((i) => i.id));
    expect(await reserved(sup.a)).toBe(0);
    // Все отмеченные вместе проходят минимум
    expect((await checkout(shop, sup.id, delivery, before.map((i) => i.id))).placed).toBe(true);
    expect(await cartItems(shop.id, sup.id)).toHaveLength(0);
  });

  it("чужие и несуществующие позиции не оформляются", async () => {
    const [shop, other, sup] = [await newShop(), await newShop(), await newSupplier()];
    await addToCart(shop, sup.id, sup.a, 1);
    await addToCart(other, sup.id, sup.b, 1);
    const foreign = (await cartItems(other.id, sup.id)).map((i) => i.id);
    await expect(checkout(shop, sup.id, delivery, [...foreign, "нет-такой"])).rejects.toThrow(OrderError);
    expect(await cartItems(shop.id, sup.id)).toHaveLength(1);
    expect(await cartItems(other.id, sup.id)).toHaveLength(1);
  });

  it("«оформить выбранное» по нескольким поставщикам: корзины без отмеченных пропускаются", async () => {
    const shop = await newShop();
    const [s1, s2, s3] = [await newSupplier(), await newSupplier(), await newSupplier()];
    await addToCart(shop, s1.id, s1.a, 1);
    await addToCart(shop, s1.id, s1.b, 1);
    await addToCart(shop, s2.id, s2.a, 4);
    await addToCart(shop, s3.id, s3.a, 1);
    const i1 = await cartItems(shop.id, s1.id);
    const i2 = await cartItems(shop.id, s2.id);
    const r = await checkoutAll(shop, delivery, [i1[0].id, ...i2.map((i) => i.id)]);
    expect(r.problems).toEqual([]);
    expect(r.placed).toHaveLength(2);
    expect((await cartItems(shop.id, s1.id)).map((i) => i.productUnitId)).toEqual([s1.b]);
    expect(await cartItems(shop.id, s2.id)).toHaveLength(0);
    expect(await cartItems(shop.id, s3.id)).toHaveLength(1);
    expect(await db.order.count({ where: { shopId: shop.id, status: "PLACED" } })).toBe(2);
  });

  it("«удалить выбранные» убирает только свои позиции из корзин", async () => {
    const [shop, other] = [await newShop(), await newShop()];
    const [s1, s2] = [await newSupplier(), await newSupplier()];
    await addToCart(shop, s1.id, s1.a, 1);
    await addToCart(shop, s1.id, s1.b, 2);
    await addToCart(shop, s2.id, s2.a, 1);
    await addToCart(other, s1.id, s1.a, 1);
    const mine = [...(await cartItems(shop.id, s1.id)), ...(await cartItems(shop.id, s2.id))];
    const foreign = await cartItems(other.id, s1.id);
    const removed = await removeCartItems(shop.id, [mine[0].id, mine[2].id, foreign[0].id]);
    expect(removed).toBe(2);
    const left = await cartItems(shop.id, s1.id);
    expect(left.map((i) => i.productUnitId)).toEqual([s1.b]);
    expect(Number((await db.order.findUniqueOrThrow({ where: { id: left[0].orderId } })).total)).toBe(4000);
    expect(await cartItems(shop.id, s2.id)).toHaveLength(0);
    expect(await cartItems(other.id, s1.id)).toHaveLength(1);
  });

  it("количество с клавиатуры: ставится точное число, сверх остатка урезается, 0 убирает позицию", async () => {
    const [shop, sup] = [await newShop(), await newSupplier()];
    expect(await setCartQtyByUnit(shop, sup.id, sup.a, 12)).toEqual({ qty: 12, clamped: false });
    expect(Number((await cartItems(shop.id, sup.id))[0].qty)).toBe(12);
    expect(await setCartQtyByUnit(shop, sup.id, sup.a, 7)).toEqual({ qty: 7, clamped: false });
    // Товара В всего 5
    expect(await setCartQtyByUnit(shop, sup.id, sup.c, 59)).toEqual({ qty: 5, clamped: true });
    const items = await cartItems(shop.id, sup.id);
    expect(items.map((i) => Number(i.qty))).toEqual([7, 5]);
    expect(await setCartQtyByUnit(shop, sup.id, sup.a, 0)).toEqual({ qty: 0, clamped: false });
    expect((await cartItems(shop.id, sup.id)).map((i) => i.productUnitId)).toEqual([sup.c]);
    // Единица чужого поставщика в корзину не попадает
    const foreign = await newSupplier();
    await expect(setCartQtyByUnit(shop, sup.id, foreign.a, 1)).rejects.toThrow(OrderError);
  });
});

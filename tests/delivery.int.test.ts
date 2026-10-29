import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { addToCart, assignCourier, checkout, OrderError, supplierOrderAction } from "@/lib/orders";
import { confirmDelivery, correctBalance, decideCancelRequest, markNotDelivered, registerDebtPayment, releaseCourierWork, requestCancel, resolveProblem, setCredit, startDelivery } from "@/lib/delivery";
import { applyStock } from "@/lib/stock";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
const actor = { userId: null, onBehalfOfUserId: null };
let supplierId = "", territoryId = "", unitId = "", courierId = "";
const delivery = { paymentMethod: "CASH" as const, deliveryAddress: "-", contactName: "-", contactPhone: "+998901234567" };

async function shopWithOrder(qty: number) {
  const shop = await db.shop.create({ data: { name: `Д ${tag} ${Math.random()}`, phone: "+998901234567", address: "-", lat: 41, lng: 69, contactName: "-", territoryId } });
  await addToCart(shop, supplierId, unitId, qty);
  const r = await checkout(shop, supplierId, delivery);
  if (!r.placed) throw new Error("not placed");
  for (const a of ["accept", "assemble", "ready"] as const) await supplierOrderAction(supplierId, r.orderId, a, null, "SUPPLIER_ADMIN");
  await assignCourier(supplierId, r.orderId, courierId, "SUPPLIER_ADMIN");
  await startDelivery(courierId, r.orderId);
  const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { items: true } });
  return { shop, order };
}

const stock = async () => {
  const u = await db.productUnit.findUniqueOrThrow({ where: { id: unitId } });
  return { physical: Number(u.physicalQty), reserved: Number(u.reservedQty) };
};

describe.skipIf(!enabled)("доставка, приёмка, оплата", () => {
  beforeAll(async () => {
    territoryId = (await db.territory.create({ data: { name: `Район доставки ${tag}`, type: "DISTRICT" } })).id;
    const s = await db.supplier.create({
      data: { legalName: "П", displayName: `Д ${tag}`, inn: tag + "7", legalAddress: "-", phone: "+998900000003", email: "d@t.uz", contactPerson: "-", officeAddress: "-", status: "ACTIVE", territories: { create: { territoryId } } },
    });
    supplierId = s.id;
    const courier = await db.user.create({ data: { phone: `+99893${tag.slice(-7)}`, passwordHash: "-", fullName: "Курьер" } });
    courierId = courier.id;
    await db.supplierMember.create({ data: { supplierId, userId: courierId, role: "COURIER" } });
    const p = await db.product.create({ data: { supplierId, name: "Сок", units: { create: { kind: "PIECE", price: 1000 } } }, include: { units: true } });
    unitId = p.units[0].id;
    await db.$transaction((tx) => applyStock(tx, { unitId, type: "INITIAL", qty: 100 }, actor));
  });
  afterAll(() => db.$disconnect());

  it("QR чужого заказа и неверный код не подходят", async () => {
    const a = await shopWithOrder(1);
    const b = await shopWithOrder(1);
    const items = a.order.items.map((i) => ({ id: i.id, delivered: 1, accepted: 1 }));
    await expect(confirmDelivery(courierId, a.order.id, { items, received: 1000, method: "CASH", qr: b.order.qrToken! })).rejects.toThrow("не подходит");
    await expect(confirmDelivery(courierId, a.order.id, { items, received: 1000, method: "CASH", qr: "AAAAAAAAAA" })).rejects.toThrow("не подходит");
    // Чужой доставщик не видит заказ
    await expect(confirmDelivery("someone", a.order.id, { items, received: 1000, method: "CASH", qr: a.order.qrToken! })).rejects.toBeInstanceOf(OrderError);
    const ok = await confirmDelivery(courierId, a.order.id, { items, received: 1000, method: "CASH", qr: `B2B-ORDER:${a.order.qrToken}` });
    expect(ok.status).toBe("COMPLETED");
    // Повтор той же приёмки (Д4: телефон отправил её второй раз) ничего не проводит заново
    const entries = await db.debtEntry.count({ where: { orderId: a.order.id } });
    const again = await confirmDelivery(courierId, a.order.id, { items, received: 5000, method: "CASH", qr: a.order.qrToken! });
    expect(again).toMatchObject({ already: true, status: "COMPLETED" });
    expect(await db.debtEntry.count({ where: { orderId: a.order.id } })).toBe(entries);
    // Чужой код к проведённому заказу по-прежнему отказ
    await expect(confirmDelivery(courierId, a.order.id, { items, received: 1000, method: "CASH", qr: b.order.qrToken! })).rejects.toBeInstanceOf(OrderError);
    // Магазин после первой доставки — «Проверенный»
    expect((await db.shop.findUniqueOrThrow({ where: { id: a.shop.id } })).status).toBe("VERIFIED");
    await markNotDelivered(courierId, b.order.id, { reason: "CLOSED", note: null });
    expect((await db.shop.findUniqueOrThrow({ where: { id: b.shop.id } })).status).toBe("FAILED_CHECK");
  });

  it("частичная приёмка: пересчёт, возврат непринятого, долг только с разрешения", async () => {
    const before = await stock();
    const { shop, order } = await shopWithOrder(10);
    const items = order.items.map((i) => ({ id: i.id, delivered: 10, accepted: 6 }));
    // Без разрешения работать в долг — оплата 500 из 6000 не проходит
    await expect(confirmDelivery(courierId, order.id, { items, received: 500, method: "CASH", qr: order.qrToken! })).rejects.toThrow("не разрешена");
    await setCredit(supplierId, shop.id, true, null);
    const r = await confirmDelivery(courierId, order.id, { items, received: 500, method: "CASH", qr: order.qrToken! });
    expect(r).toMatchObject({ status: "PARTIALLY_ACCEPTED", total: 6000, orderDebt: 5500, balanceAfter: 5500 });
    // Продано 6, 4 вернулись в доступный остаток
    expect(await stock()).toEqual({ physical: before.physical - 6, reserved: before.reserved });
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect([Number(item.deliveredQty), Number(item.acceptedQty)]).toEqual([10, 6]);

    // Следующий заказ: получено 1500 за заказ 1000 и часть долга
    const acc = await db.shopAccount.findFirstOrThrow({ where: { shopId: shop.id } });
    await addToCart(shop, supplierId, unitId, 1);
    const p = await checkout(shop, supplierId, delivery);
    if (!p.placed) throw new Error();
    for (const a of ["accept", "assemble", "ready"] as const) await supplierOrderAction(supplierId, p.orderId, a, null, "SUPPLIER_ADMIN");
    await assignCourier(supplierId, p.orderId, courierId, "SUPPLIER_ADMIN");
    await startDelivery(courierId, p.orderId);
    const o2 = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { items: true } });
    const r2 = await confirmDelivery(courierId, o2.id, { items: o2.items.map((i) => ({ id: i.id, delivered: 1, accepted: 1 })), received: 1500, method: "CARD", qr: o2.qrToken! });
    expect(r2).toMatchObject({ toOrder: 1000, toDebt: 500, balanceAfter: 5000 });

    // Погашение, корректировка и переплата
    await registerDebtPayment(supplierId, shop.id, 5300, "TRANSFER", new Date(), "по счёту");
    await correctBalance(supplierId, shop.id, 200, "Ошибка в сумме", order.id, "SUPPLIER_OWNER");
    const after = await db.shopAccount.findUniqueOrThrow({ where: { id: acc.id }, include: { entries: { orderBy: { createdAt: "asc" } } } });
    expect(Number(after.balance)).toBe(-100);
    // Журнал сходится: баланс = сумма записей
    expect(after.entries.reduce((s, e) => s + Number(e.amount), 0)).toBe(-100);
    expect(Number(after.entries.at(-1)!.balanceAfter)).toBe(-100);
  });

  it("отмена во время доставки — только с согласия поставщика", async () => {
    const before = await stock();
    const { shop, order } = await shopWithOrder(3);
    await requestCancel(shop.id, order.id, "передумали");
    await expect(confirmDelivery(courierId, order.id, { items: order.items.map((i) => ({ id: i.id, delivered: 3, accepted: 3 })), received: 3000, method: "CASH", qr: order.qrToken! })).rejects.toThrow("запросил отмену");
    await decideCancelRequest(supplierId, order.id, true, null, "SUPPLIER_ADMIN");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CANCELLED_BY_SHOP");
    expect(await stock()).toEqual(before);
  });
});

import { assignReplacement, completeReplacement, createReplacement, decideReplacement, setReturnedStatus } from "@/lib/replacements";

describe.skipIf(!enabled)("замены и возвращённые товары", () => {
  it("замена резервирует новый товар, забранный идёт в возвращённые, в оборот — отдельной операцией", async () => {
    const { shop, order } = await shopWithOrder(4);
    await setCredit(supplierId, shop.id, true, null);
    await confirmDelivery(courierId, order.id, { items: order.items.map((i) => ({ id: i.id, delivered: 4, accepted: 4 })), received: 4000, method: "CASH", qr: order.qrToken! });
    const item = order.items[0];
    await expect(createReplacement(shop.id, { orderId: order.id, orderItemId: item.id, qty: 5, reason: "Брак", photoPaths: [], videoPaths: [] })).rejects.toThrow("не больше");
    const r = await createReplacement(shop.id, { orderId: order.id, orderItemId: item.id, qty: 2, reason: "Брак", photoPaths: [], videoPaths: [] });
    const s0 = await stock();
    await decideReplacement(supplierId, r.id, true, null);
    expect(await stock()).toEqual({ physical: s0.physical, reserved: s0.reserved + 2 });
    await assignReplacement(supplierId, r.id, { courierId });
    await completeReplacement(courierId, r.id, null, []);
    expect(await stock()).toEqual({ physical: s0.physical - 2, reserved: s0.reserved });
    const returned = await db.returnedItem.findFirstOrThrow({ where: { replacementId: r.id } });
    expect(returned.status).toBe("PENDING_CHECK");
    await setReturnedStatus(supplierId, returned.id, "USABLE", null);
    await setReturnedStatus(supplierId, returned.id, "BACK_TO_STOCK", "после проверки");
    expect(await stock()).toEqual({ physical: s0.physical, reserved: s0.reserved });
    await expect(setReturnedStatus(supplierId, returned.id, "DEFECTIVE", null)).rejects.toThrow("окончательный");
  });

  it("параллельные заявки на замену не превышают принятое количество", async () => {
    const { shop, order } = await shopWithOrder(4);
    await confirmDelivery(courierId, order.id, { items: order.items.map((i) => ({ id: i.id, delivered: 4, accepted: 4 })), received: 4000, method: "CASH", qr: order.qrToken! });
    const input = { orderId: order.id, orderItemId: order.items[0].id, qty: 1, reason: "Брак", photoPaths: [], videoPaths: [] };
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => createReplacement(shop.id, input)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    expect(await db.replacement.count({ where: { orderItemId: input.orderItemId } })).toBe(4);
  });
});

describe.skipIf(!enabled)("чужой поставщик не трогает счёт магазина", () => {
  it("без заказов и счёта — нельзя начислить долг, оплату или открыть кредит", async () => {
    const shop = await db.shop.create({ data: { name: `Чужой ${tag}`, phone: "+998901234567", address: "-", lat: 41, lng: 69, contactName: "-", territoryId } });
    await expect(correctBalance(supplierId, shop.id, 1_000_000, "Ошибка в сумме", null, "SUPPLIER_OWNER")).rejects.toThrow("Магазин не найден");
    await expect(registerDebtPayment(supplierId, shop.id, 1000, "CASH", new Date(), null)).rejects.toThrow("Магазин не найден");
    await expect(setCredit(supplierId, shop.id, true, 5_000_000)).rejects.toThrow("Магазин не найден");
    expect(await db.shopAccount.count({ where: { shopId: shop.id } })).toBe(0);
  });

  it("отключённый доставщик теряет заказы: назначенные — на переназначение, в пути — в проблему", async () => {
    const user = await db.user.create({ data: { phone: `+99894${tag.slice(-7)}`, passwordHash: "-", fullName: "Второй" } });
    const member = await db.supplierMember.create({ data: { supplierId, userId: user.id, role: "COURIER" } });
    const inTransit = await shopWithOrder(1);
    await db.order.update({ where: { id: inTransit.order.id }, data: { courierId: user.id } });
    const assigned = await shopWithOrder(1);
    await db.order.update({ where: { id: assigned.order.id }, data: { courierId: user.id, status: "ASSIGNED" } });
    await db.supplierMember.update({ where: { id: member.id }, data: { isActive: false } });
    // Пока заказы на нём, отключённый доставщик не может их провести (даже работая у другого поставщика)
    const items = inTransit.order.items.map((i) => ({ id: i.id, delivered: 1, accepted: 1 }));
    await expect(confirmDelivery(user.id, inTransit.order.id, { items, received: 1000, method: "CASH", qr: inTransit.order.qrToken! })).rejects.toThrow("не найден");
    expect(await releaseCourierWork(supplierId, user.id, "SUPPLIER_OWNER")).toMatchObject({ reassign: 1, problems: 1 });
    expect(await db.order.findUniqueOrThrow({ where: { id: assigned.order.id } })).toMatchObject({ status: "READY", courierId: null });
    expect((await db.order.findUniqueOrThrow({ where: { id: inTransit.order.id } })).status).toBe("DELIVERY_PROBLEM");
    // «Продолжить доставку» с отключённым доставщиком нельзя — только вернуть на склад
    await expect(resolveProblem(supplierId, inTransit.order.id, "continue", null, "SUPPLIER_OWNER")).rejects.toThrow("отключён");
    await resolveProblem(supplierId, inTransit.order.id, "back_to_ready", null, "SUPPLIER_OWNER");
    expect(await db.order.findUniqueOrThrow({ where: { id: inTransit.order.id } })).toMatchObject({ status: "READY", courierId: null });
  });
});

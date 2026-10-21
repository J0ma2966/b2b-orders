import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { addToCart, assignCourier, checkout, makeReady, repeatOrder, supplierOrderAction } from "@/lib/orders";
import { confirmDelivery, markNotDelivered, setCredit, startDelivery } from "@/lib/delivery";
import { applyStock } from "@/lib/stock";
import { acceptHandover, courierCash } from "@/lib/cash";
import { runJobs } from "@/lib/jobs";
import { issueCommissionInvoices, previousMonth } from "@/lib/commission-invoices";
import { tashkentDay } from "@/lib/order-core";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
const actor = { userId: null, onBehalfOfUserId: null };
let supplierId = "", territoryId = "", unitId = "", courierId = "";
const delivery = { paymentMethod: "CASH" as const, deliveryAddress: "-", contactName: "-", contactPhone: "+998901234567" };

const newShop = () =>
  db.shop.create({ data: { name: `У ${tag} ${Math.random()}`, phone: "+998901234567", address: "-", lat: 41, lng: 69, contactName: "-", territoryId } });

async function placed(qty: number, shop?: Awaited<ReturnType<typeof newShop>>) {
  const s = shop ?? (await newShop());
  await addToCart(s, supplierId, unitId, qty);
  const r = await checkout(s, supplierId, delivery);
  if (!r.placed) throw new Error("not placed");
  return { shop: s, orderId: r.orderId };
}

async function inTransit(qty: number, shop?: Awaited<ReturnType<typeof newShop>>) {
  const p = await placed(qty, shop);
  await supplierOrderAction(supplierId, p.orderId, "accept", null, "SUPPLIER_ADMIN");
  await makeReady(supplierId, p.orderId, "SUPPLIER_ADMIN");
  await assignCourier(supplierId, p.orderId, courierId, "SUPPLIER_ADMIN");
  await startDelivery(courierId, p.orderId);
  const order = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { items: true } });
  return { shop: p.shop, order };
}

const unit = () => db.productUnit.findUniqueOrThrow({ where: { id: unitId } });

describe.skipIf(!enabled)("улучшения: условия заказа, касса, фоновые задачи", () => {
  beforeAll(async () => {
    territoryId = (await db.territory.create({ data: { name: `Район улучшений ${tag}`, type: "DISTRICT" } })).id;
    const s = await db.supplier.create({
      data: { legalName: "П", displayName: `У ${tag}`, inn: tag + "9", legalAddress: "-", phone: "+998900000009", email: "u@t.uz", contactPerson: "-", officeAddress: "-", status: "ACTIVE", commissionRate: 2, territories: { create: { territoryId } } },
    });
    supplierId = s.id;
    const courier = await db.user.create({ data: { phone: `+99894${tag.slice(-7)}`, passwordHash: "-", fullName: "Курьер У" } });
    courierId = courier.id;
    await db.supplierMember.create({ data: { supplierId, userId: courierId, role: "COURIER" } });
    const owner = await db.user.create({ data: { phone: `+99895${tag.slice(-7)}`, passwordHash: "-", fullName: "Владелец У" } });
    await db.supplierMember.create({ data: { supplierId, userId: owner.id, role: "OWNER" } });
    const p = await db.product.create({ data: { supplierId, name: "Чай", units: { create: { kind: "PIECE", price: 1000 } } }, include: { units: true } });
    unitId = p.units[0].id;
    await db.$transaction((tx) => applyStock(tx, { unitId, type: "INITIAL", qty: 500 }, actor));
  });
  afterAll(async () => {
    await db.supplier.update({ where: { id: supplierId }, data: { minOrderTotal: null, orderCutoffHour: null, creditOverLimitBlock: false } });
    await db.$disconnect();
  });

  it("П5: минимальная сумма и только доступные даты доставки", async () => {
    await db.supplier.update({ where: { id: supplierId }, data: { minOrderTotal: 5000, orderCutoffHour: 16 } });
    await db.supplierTerritory.update({ where: { supplierId_territoryId: { supplierId, territoryId } }, data: { deliveryWeekdays: [2, 4] } });
    const shop = await newShop();
    await addToCart(shop, supplierId, unitId, 2);
    await expect(checkout(shop, supplierId, delivery)).rejects.toThrow("Минимальная сумма");
    await addToCart(shop, supplierId, unitId, 4);
    // Дата не из расписания — отказ; без даты — первая доступная (вторник или четверг)
    const tomorrow = tashkentDay(new Date(), 1);
    const wrong = [0, 1, 2, 3, 4, 5, 6].map((d) => tashkentDay(new Date(), d)).find((d) => ![2, 4].includes(d.getUTCDay()))!;
    await expect(checkout(shop, supplierId, { ...delivery, deliveryDate: wrong })).rejects.toThrow("не доставляет");
    const r = await checkout(shop, supplierId, delivery);
    expect(r.placed).toBe(true);
    const o = await db.order.findUniqueOrThrow({ where: { id: (r as { orderId: string }).orderId } });
    expect([2, 4]).toContain(o.deliveryDate!.getUTCDay());
    expect(o.deliveryDate!.getTime()).toBeGreaterThanOrEqual(tomorrow.getTime());
    await db.supplier.update({ where: { id: supplierId }, data: { minOrderTotal: null, orderCutoffHour: null } });
    await db.supplierTerritory.update({ where: { supplierId_territoryId: { supplierId, territoryId } }, data: { deliveryWeekdays: [] } });
  });

  it("Л1: заказ сверх кредита запрещается, если поставщик так настроил", async () => {
    const { shop } = await placed(2); // 2000 из 3000
    await setCredit(supplierId, shop.id, true, 3000);
    await db.supplier.update({ where: { id: supplierId }, data: { creditOverLimitBlock: true } });
    await addToCart(shop, supplierId, unitId, 2); // ещё 2000 — выше лимита на 1000
    await expect(checkout(shop, supplierId, delivery)).rejects.toThrow("превышает доступный кредит");
    await db.supplier.update({ where: { id: supplierId }, data: { creditOverLimitBlock: false } });
    expect((await checkout(shop, supplierId, delivery)).placed).toBe(true);
  });

  it("Д1: наличные на руках и сдача с расхождением", async () => {
    const before = await courierCash(supplierId, courierId);
    const { order } = await inTransit(3);
    await confirmDelivery(courierId, order.id, { items: order.items.map((i) => ({ id: i.id, delivered: 3, accepted: 3 })), received: 3000, method: "CASH", qr: order.qrToken! });
    const after = await courierCash(supplierId, courierId);
    expect(after.onHand).toBe(before.onHand + 3000);
    const h = await acceptHandover(supplierId, courierId, after.onHand - 500, null);
    expect(h.diff).toBe(500);
    expect((await courierCash(supplierId, courierId)).onHand).toBe(500);
  });

  it("Л6: «нет денег» не делает магазин «Не прошёл проверку», «закрыто» — делает", async () => {
    const a = await inTransit(1);
    await markNotDelivered(courierId, a.order.id, { reason: "NO_MONEY", note: null });
    expect((await db.shop.findUniqueOrThrow({ where: { id: a.shop.id } })).status).toBe("NEW");
    const b = await inTransit(1);
    await markNotDelivered(courierId, b.order.id, { reason: "CLOSED", note: "замок" });
    expect((await db.shop.findUniqueOrThrow({ where: { id: b.shop.id } })).status).toBe("FAILED_CHECK");
    expect((await db.order.findUniqueOrThrow({ where: { id: b.order.id } })).problemNote).toBe("Магазин закрыт / нет на месте: замок");
  });

  it("М1: повтор заказа кладёт товары в корзину и пишет, чего не хватает", async () => {
    const { shop, order } = await inTransit(4);
    await confirmDelivery(courierId, order.id, { items: order.items.map((i) => ({ id: i.id, delivered: 4, accepted: 4 })), received: 4000, method: "CARD", qr: order.qrToken! });
    const r = await repeatOrder(shop, order.id);
    expect(r).toMatchObject({ added: 1, notes: [] });
    const cart = await db.order.findFirstOrThrow({ where: { shopId: shop.id, status: "DRAFT" }, include: { items: true } });
    expect(Number(cart.items[0].qty)).toBe(4);
    const other = await newShop();
    await expect(repeatOrder(other, order.id)).rejects.toThrow("не найден");
  });

  it("Л2, Л7: напоминание, затем автоотмена с освобождением резерва; корзина — одно напоминание", async () => {
    const { shop, orderId } = await placed(5);
    const reservedBefore = Number((await unit()).reservedQty);
    await db.order.update({ where: { id: orderId }, data: { placedAt: new Date(Date.now() - 3 * 3_600_000) } });
    await runJobs();
    let o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe("PLACED");
    expect(o.staleRemindedAt).not.toBeNull();
    await db.order.update({ where: { id: orderId }, data: { placedAt: new Date(Date.now() - 25 * 3_600_000) } });
    await runJobs();
    o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o).toMatchObject({ status: "CANCELLED_BY_SUPPLIER", cancelledBy: "PLATFORM" });
    expect(Number((await unit()).reservedQty)).toBe(reservedBefore - 5);
    expect(await db.notification.count({ where: { entityId: orderId, type: "order.auto_cancelled" } })).toBeGreaterThan(0);

    await addToCart(shop, supplierId, unitId, 1);
    const cart = await db.order.findFirstOrThrow({ where: { shopId: shop.id, status: "DRAFT" } });
    await db.$executeRaw`UPDATE "Order" SET "updatedAt" = now() - interval '2 days' WHERE id = ${cart.id}`;
    await runJobs();
    const first = await db.order.findUniqueOrThrow({ where: { id: cart.id } });
    expect(first.cartRemindedAt).not.toBeNull();
    // Отметка не меняет время изменения корзины, повторный запуск не напоминает снова
    expect(Date.now() - first.updatedAt.getTime()).toBeGreaterThan(86_400_000);
    await runJobs();
    expect((await db.order.findUniqueOrThrow({ where: { id: cart.id } })).cartRemindedAt).toEqual(first.cartRemindedAt);
  });

  it("П6: уведомление, когда доступный остаток опускается ниже порога", async () => {
    const u = await unit();
    const avail = Number(u.physicalQty) - Number(u.reservedQty);
    await db.productUnit.update({ where: { id: unitId }, data: { lowStockThreshold: avail - 1 } });
    const count = () => db.notification.count({ where: { entityId: unitId, type: "stock.low" } });
    const before = await count();
    await db.$transaction((tx) => applyStock(tx, { unitId, type: "WRITE_OFF", qty: 2, reason: "тест" }, actor));
    await db.$transaction((tx) => applyStock(tx, { unitId, type: "WRITE_OFF", qty: 1, reason: "тест" }, actor));
    // Только при пересечении порога, а не при каждом следующем списании
    expect((await count()) - before).toBeGreaterThan(0);
    const once = await count();
    await db.$transaction((tx) => applyStock(tx, { unitId, type: "WRITE_OFF", qty: 1, reason: "тест" }, actor));
    expect(await count()).toBe(once);
    await db.productUnit.update({ where: { id: unitId }, data: { lowStockThreshold: null } });
  });

  it("А1: счёт на комиссию за прошлый месяц выставляется один раз", async () => {
    const { order } = await inTransit(1);
    await confirmDelivery(courierId, order.id, { items: order.items.map((i) => ({ id: i.id, delivered: 1, accepted: 1 })), received: 1000, method: "CASH", qr: order.qrToken! });
    const { from } = previousMonth(new Date());
    await db.order.update({ where: { id: order.id }, data: { completedAt: new Date(from.getTime() + 86_400_000) } });
    await issueCommissionInvoices();
    await issueCommissionInvoices();
    const inv = await db.commissionInvoice.findMany({ where: { supplierId } });
    expect(inv).toHaveLength(1);
    expect(Number(inv[0].amount)).toBe(20);
  });
});

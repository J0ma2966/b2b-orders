import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { addForcedItem, addToCart, assignCourier, cancelByShop, checkout, supplierOrderAction } from "@/lib/orders";
import { confirmDelivery, correctBalance, decideCancelRequest, registerDebtPayment, requestCancel, setCredit, startDelivery } from "@/lib/delivery";
import { applyStock } from "@/lib/stock";

// Согласованность данных при одновременных действиях разных людей и повторных отправках с телефона:
// остаток и резерв сходятся с открытыми заказами, баланс счёта — с журналом задолженности.

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
const actor = { userId: null, onBehalfOfUserId: null };
let supplierId = "", territoryId = "", unitId = "", courierId = "";
const delivery = { paymentMethod: "CASH" as const, deliveryAddress: "-", contactName: "-", contactPhone: "+998901234567" };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const newShop = () =>
  db.shop.create({ data: { name: `Синхр ${tag} ${Math.random()}`, phone: "+998901234567", address: "-", lat: 41, lng: 69, contactName: "-", territoryId } });

async function placed(shop: { id: string; territoryId: string; isBlocked: boolean }, qty: number) {
  await addToCart(shop, supplierId, unitId, qty);
  const r = await checkout(shop, supplierId, delivery);
  if (!r.placed) throw new Error("not placed");
  return r.orderId;
}

async function inTransit(shop: Awaited<ReturnType<typeof newShop>>, qty: number) {
  const id = await placed(shop, qty);
  for (const a of ["accept", "assemble", "ready"] as const) await supplierOrderAction(supplierId, id, a, null, "SUPPLIER_ADMIN");
  await assignCourier(supplierId, id, courierId, "SUPPLIER_ADMIN");
  await startDelivery(courierId, id);
  return db.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
}

// Резерв товара = сумма количеств в открытых (оформленных, но не завершённых) заказах
async function assertStockInvariant() {
  const u = await db.productUnit.findUniqueOrThrow({ where: { id: unitId } });
  const open = await db.orderItem.aggregate({
    where: { productUnitId: unitId, order: { status: { notIn: ["DRAFT", "COMPLETED", "PARTIALLY_ACCEPTED", "NOT_DELIVERED", "CANCELLED_BY_SHOP", "CANCELLED_BY_SUPPLIER", "REJECTED"] } } },
    _sum: { qty: true },
  });
  expect(Number(u.reservedQty)).toBe(Number(open._sum.qty ?? 0));
  expect(Number(u.reservedQty)).toBeGreaterThanOrEqual(0);
  expect(Number(u.reservedQty)).toBeLessThanOrEqual(Number(u.physicalQty));
}

// Баланс счёта = сумма записей журнала; «остаток после» последней записи совпадает с балансом
async function assertAccountInvariant(shopId: string) {
  const acc = await db.shopAccount.findUniqueOrThrow({ where: { shopId_supplierId: { shopId, supplierId } } });
  const sum = await db.debtEntry.aggregate({ where: { accountId: acc.id }, _sum: { amount: true } });
  expect(Number(acc.balance)).toBe(Number(sum._sum.amount ?? 0));
  // Записи шли строго по очереди: каждая начиналась с остатка после какой-то другой записи (или с нуля),
  // ни одно изменение не потерялось
  const entries = await db.debtEntry.findMany({ where: { accountId: acc.id } });
  const afters = new Set([0, ...entries.map((e) => Number(e.balanceAfter))]);
  for (const e of entries) expect(afters.has(Number(e.balanceAfter) - Number(e.amount))).toBe(true);
}

describe.skipIf(!enabled)("синхронизация данных при одновременных действиях", () => {
  beforeAll(async () => {
    territoryId = (await db.territory.create({ data: { name: `Район синхр ${tag}`, type: "DISTRICT" } })).id;
    const s = await db.supplier.create({
      data: { legalName: "П", displayName: `Синхр ${tag}`, inn: tag + "9", legalAddress: "-", phone: "+998900000005", email: "s@t.uz", contactPerson: "-", officeAddress: "-", status: "ACTIVE", territories: { create: { territoryId } } },
    });
    supplierId = s.id;
    const courier = await db.user.create({ data: { phone: `+99894${tag.slice(-7)}`, passwordHash: "-", fullName: "Курьер" } });
    courierId = courier.id;
    await db.supplierMember.create({ data: { supplierId, userId: courierId, role: "COURIER" } });
    const p = await db.product.create({ data: { supplierId, name: "Вода", units: { create: { kind: "PIECE", price: 1000 } } }, include: { units: true } });
    unitId = p.units[0].id;
    await db.$transaction((tx) => applyStock(tx, { unitId, type: "INITIAL", qty: 1000 }, actor));
  });
  afterAll(() => db.$disconnect());

  it("приёмка, отправленная с телефона дважды одновременно (очередь без сети + повтор), проводится один раз", async () => {
    const shop = await newShop();
    const order = await inTransit(shop, 4);
    await setCredit(supplierId, shop.id, true, null);
    const items = order.items.map((i) => ({ id: i.id, delivered: 4, accepted: 4 }));
    const send = () => confirmDelivery(courierId, order.id, { items, received: 1000, method: "CASH", qr: order.qrToken! });
    const results = await Promise.allSettled([send(), send(), send(), send()]);
    const ok = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof send>>>).value);
    expect(ok.length).toBe(4);
    expect(ok.filter((r) => !r.already).length).toBe(1);
    expect(await db.debtEntry.count({ where: { orderId: order.id, type: "ORDER_CHARGE" } })).toBe(1);
    const acc = await db.shopAccount.findUniqueOrThrow({ where: { shopId_supplierId: { shopId: shop.id, supplierId } } });
    expect(Number(acc.balance)).toBe(3000);
    await assertAccountInvariant(shop.id);
    await assertStockInvariant();
  });

  it("оплата долга, корректировка и приёмка по одному счёту одновременно — баланс сходится с журналом", async () => {
    const shop = await newShop();
    await setCredit(supplierId, shop.id, true, null).catch(() => {});
    const orders = [await inTransit(shop, 2), await inTransit(shop, 3), await inTransit(shop, 1)];
    await setCredit(supplierId, shop.id, true, null);
    const jobs: Promise<unknown>[] = [];
    for (const o of orders) {
      jobs.push(confirmDelivery(courierId, o.id, { items: o.items.map((i) => ({ id: i.id, delivered: Number(i.qty), accepted: Number(i.qty) })), received: 500, method: "CASH", qr: o.qrToken! }));
    }
    for (let i = 0; i < 5; i++) jobs.push(wait(i * 3).then(() => registerDebtPayment(supplierId, shop.id, 100, "CASH", new Date(), null)));
    for (let i = 0; i < 3; i++) jobs.push(wait(i * 5).then(() => correctBalance(supplierId, shop.id, i % 2 ? -50 : 70, "сверка", null, "SUPPLIER_ADMIN")));
    const results = await Promise.allSettled(jobs);
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    // 6 штук по 1000, оплачено 3×500 + 5×100, корректировки +70 −50 +70
    const acc = await db.shopAccount.findUniqueOrThrow({ where: { shopId_supplierId: { shopId: shop.id, supplierId } } });
    expect(Number(acc.balance)).toBe(6000 - 1500 - 500 + 90);
    await assertAccountInvariant(shop.id);
    await assertStockInvariant();
  });

  it("магазин отменяет заказ, пока поставщик его принимает: резерв освобождается ровно один раз", async () => {
    for (let round = 0; round < 8; round++) {
      const shop = await newShop();
      const id = await placed(shop, 5);
      await Promise.allSettled([
        wait(round % 3).then(() => cancelByShop(shop.id, id, "передумали")),
        wait((round + 1) % 3).then(() => supplierOrderAction(supplierId, id, "accept", null, "SUPPLIER_ADMIN")),
        wait(round % 2).then(() => addForcedItem(supplierId, id, unitId, 1, "SUPPLIER_ADMIN")),
      ]);
      const o = await db.order.findUniqueOrThrow({ where: { id } });
      expect(["CANCELLED_BY_SHOP", "ACCEPTED"]).toContain(o.status);
      await assertStockInvariant();
    }
  });

  it("запрос отмены в пути и приёмка одновременно: либо отмена, либо приёмка, не обе", async () => {
    for (let round = 0; round < 6; round++) {
      const shop = await newShop();
      const order = await inTransit(shop, 2);
      await setCredit(supplierId, shop.id, true, null);
      const items = order.items.map((i) => ({ id: i.id, delivered: 2, accepted: 2 }));
      await Promise.allSettled([
        wait(round % 3).then(() => requestCancel(shop.id, order.id, "закрываемся")),
        wait((round + 1) % 3).then(() => confirmDelivery(courierId, order.id, { items, received: 0, method: "CASH", qr: order.qrToken! })),
      ]);
      let o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      if (o.status === "NEEDS_CONFIRMATION") {
        await decideCancelRequest(supplierId, order.id, true, null, "SUPPLIER_ADMIN");
        o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(o.status).toBe("CANCELLED_BY_SHOP");
        expect(await db.debtEntry.count({ where: { orderId: order.id } })).toBe(0);
      } else {
        expect(o.status).toBe("COMPLETED");
        expect(await db.debtEntry.count({ where: { orderId: order.id, type: "ORDER_CHARGE" } })).toBe(1);
      }
      await assertAccountInvariant(shop.id);
      await assertStockInvariant();
    }
  });
});

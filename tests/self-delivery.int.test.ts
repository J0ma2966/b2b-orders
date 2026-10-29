import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Действует тот, кто назначен в authUser (нужен, чтобы проверить «себе уведомление не шлём»)
const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth/current", () => ({
  getAuth: async () => (h.userId ? { realUser: { id: h.userId }, user: { id: h.userId }, isImpersonating: false } : null),
}));

import { db } from "@/lib/db";
import { addToCart, assignCourier, checkout, makeReady, suggestedCourier, supplierOrderAction } from "@/lib/orders";
import { confirmDelivery, startDelivery } from "@/lib/delivery";
import { applyStock } from "@/lib/stock";
import { acceptHandover, courierCash } from "@/lib/cash";
import { canSetDelivers, delivererWhere, handsOverCash, isDeliverer } from "@/lib/supplier-roles";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
const actor = { userId: null, onBehalfOfUserId: null };
let supplierId = "", territoryId = "", unitId = "", ownerId = "", ownerMemberId = "", adminId = "";
const delivery = { paymentMethod: "CASH" as const, deliveryAddress: "-", contactName: "-", contactPhone: "+998901234567" };

async function readyOrder(qty: number) {
  const shop = await db.shop.create({ data: { name: `С ${tag} ${Math.random()}`, phone: "+998901234567", address: "-", lat: 41, lng: 69, contactName: "-", territoryId } });
  await addToCart(shop, supplierId, unitId, qty);
  const r = await checkout(shop, supplierId, delivery);
  if (!r.placed) throw new Error("not placed");
  await supplierOrderAction(supplierId, r.orderId, "accept", null, "SUPPLIER_OWNER");
  await makeReady(supplierId, r.orderId, "SUPPLIER_OWNER");
  return { shop, orderId: r.orderId };
}

describe("кто развозит заказы", () => {
  it("доставщик всегда, владелец и администратор — если включили «Сам развожу»", () => {
    expect(isDeliverer({ role: "COURIER", delivers: false })).toBe(true);
    expect(isDeliverer({ role: "OWNER", delivers: false })).toBe(false);
    expect(isDeliverer({ role: "OWNER", delivers: true })).toBe(true);
    expect(isDeliverer({ role: "ADMIN", delivers: true })).toBe(true);
  });

  it("включает владелец — себе и администраторам, администратор — только себе", () => {
    expect(canSetDelivers("OWNER", "OWNER", true)).toBe(true);
    expect(canSetDelivers("OWNER", "ADMIN", false)).toBe(true);
    expect(canSetDelivers("ADMIN", "ADMIN", true)).toBe(true);
    expect(canSetDelivers("ADMIN", "ADMIN", false)).toBe(false);
    expect(canSetDelivers("ADMIN", "OWNER", false)).toBe(false);
    expect(canSetDelivers("OWNER", "COURIER", false)).toBe(false);
  });

  it("владельцу сдавать кассу некому", () => {
    expect(handsOverCash("OWNER")).toBe(false);
    expect(handsOverCash("ADMIN")).toBe(true);
    expect(handsOverCash("COURIER")).toBe(true);
  });
});

describe.skipIf(!enabled)("поставщик-ИП развозит сам", () => {
  beforeAll(async () => {
    territoryId = (await db.territory.create({ data: { name: `Район ИП ${tag}`, type: "DISTRICT" } })).id;
    const s = await db.supplier.create({
      data: { legalName: "ИП", displayName: `ИП ${tag}`, inn: tag + "5", legalAddress: "-", phone: "+998900000005", email: "ip@t.uz", contactPerson: "-", officeAddress: "-", status: "ACTIVE", territories: { create: { territoryId } } },
    });
    supplierId = s.id;
    const owner = await db.user.create({ data: { phone: `+99894${tag.slice(-7)}`, passwordHash: "-", fullName: "Хозяин" } });
    const admin = await db.user.create({ data: { phone: `+99895${tag.slice(-7)}`, passwordHash: "-", fullName: "Помощник" } });
    ownerId = owner.id;
    adminId = admin.id;
    ownerMemberId = (await db.supplierMember.create({ data: { supplierId, userId: ownerId, role: "OWNER" } })).id;
    await db.supplierMember.create({ data: { supplierId, userId: adminId, role: "ADMIN", delivers: true } });
    const p = await db.product.create({ data: { supplierId, name: "Самса", units: { create: { kind: "PIECE", price: 2000 } } }, include: { units: true } });
    unitId = p.units[0].id;
    await db.$transaction((tx) => applyStock(tx, { unitId, type: "INITIAL", qty: 100 }, actor));
  });
  afterAll(() => db.$disconnect());

  it("без «Сам развожу» владельцу доставку не назначить", async () => {
    const { orderId } = await readyOrder(1);
    await expect(assignCourier(supplierId, orderId, ownerId, "SUPPLIER_OWNER")).rejects.toThrow("Доставщик не найден");
    const list = await db.supplierMember.findMany({ where: { supplierId, ...delivererWhere } });
    expect(list.map((m) => m.userId)).toEqual([adminId]);
  });

  it("владелец назначает на себя и проводит доставку той же логикой, что доставщик", async () => {
    await db.supplierMember.update({ where: { id: ownerMemberId }, data: { delivers: true } });
    const { shop, orderId } = await readyOrder(5);
    h.userId = ownerId;
    try {
      await assignCourier(supplierId, orderId, ownerId, "SUPPLIER_OWNER");
    } finally {
      h.userId = null;
    }
    // Назначил сам себе — уведомление «Вам назначен заказ» не нужно, магазину — да
    expect(await db.notification.count({ where: { userId: ownerId, type: "order.assigned" } })).toBe(0);
    await startDelivery(ownerId, orderId);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    expect(order).toMatchObject({ status: "IN_TRANSIT", courierId: ownerId });
    // Частичная приёмка по QR магазина и наличные
    const r = await confirmDelivery(ownerId, orderId, { items: order.items.map((i) => ({ id: i.id, delivered: 5, accepted: 4 })), received: 8000, method: "CASH", qr: order.qrToken! });
    expect(r).toMatchObject({ status: "PARTIALLY_ACCEPTED", total: 8000 });
    expect((await db.shop.findUniqueOrThrow({ where: { id: shop.id } })).status).toBe("VERIFIED");
    // Наличные видны в кассе, но владелец не сдаёт их сам себе
    expect((await courierCash(supplierId, ownerId)).today).toBe(8000);
    await expect(acceptHandover(supplierId, ownerId, 8000, null)).rejects.toThrow("Доставщик не найден");
  });

  it("администратор, который развозит, сдаёт кассу как доставщик", async () => {
    const { orderId } = await readyOrder(1);
    await assignCourier(supplierId, orderId, adminId, "SUPPLIER_OWNER");
    expect(await db.notification.count({ where: { userId: adminId, type: "order.assigned" } })).toBe(1);
    await startDelivery(adminId, orderId);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    await confirmDelivery(adminId, orderId, { items: order.items.map((i) => ({ id: i.id, delivered: 1, accepted: 1 })), received: 2000, method: "CASH", qr: order.qrToken! });
    const h1 = await acceptHandover(supplierId, adminId, 2000, null);
    expect(h1.diff).toBe(0);
    expect((await courierCash(supplierId, adminId)).onHand).toBe(0);
  });

  it("закреплённым за районом может быть сам поставщик", async () => {
    await db.supplierTerritory.update({ where: { supplierId_territoryId: { supplierId, territoryId } }, data: { courierId: ownerId } });
    expect(await suggestedCourier(supplierId, territoryId)).toBe(ownerId);
    await db.supplierMember.update({ where: { id: ownerMemberId }, data: { delivers: false } });
    expect(await suggestedCourier(supplierId, territoryId)).toBeNull();
  });
});

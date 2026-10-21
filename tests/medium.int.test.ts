import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { addToCart, assignCourier, checkout, checkoutAll, makeReady, supplierOrderAction } from "@/lib/orders";
import { confirmDelivery, correctBalance, startDelivery } from "@/lib/delivery";
import { applyStock } from "@/lib/stock";
import { createReplacement, creditReplacement, decideReplacement } from "@/lib/replacements";
import { addShopStaff, askOwnerToCheckout, resetShopStaffPassword, toggleShopStaff } from "@/lib/shop-team";
import { courierRoute, moveInRoute, resetRoute } from "@/lib/route";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
const actor = { userId: null, onBehalfOfUserId: null };
let territoryId = "", courierId = "";
const suppliers: { id: string; unitId: string }[] = [];
const delivery = { paymentMethod: "CASH" as const, deliveryAddress: "-", contactName: "-", contactPhone: "+998901234567" };

const newShop = (lat = 41, lng = 69) =>
  db.shop.create({ data: { name: `С ${tag} ${Math.random()}`, phone: "+998901234567", address: "-", lat, lng, contactName: "-", territoryId } });

async function shopWithOwner() {
  const shop = await newShop();
  const owner = await db.user.create({ data: { phone: `+99897${String(Math.random()).slice(2, 9)}`, passwordHash: "-", fullName: "Владелец" } });
  await db.shopMember.create({ data: { shopId: shop.id, userId: owner.id, role: "OWNER" } });
  return { shop, owner };
}

async function delivered(qty: number, shop?: Awaited<ReturnType<typeof newShop>>) {
  const s = shop ?? (await newShop());
  const { id: supplierId, unitId } = suppliers[0];
  await addToCart(s, supplierId, unitId, qty);
  const r = await checkout(s, supplierId, delivery);
  if (!r.placed) throw new Error("not placed");
  await supplierOrderAction(supplierId, r.orderId, "accept", null, "SUPPLIER_ADMIN");
  await makeReady(supplierId, r.orderId, "SUPPLIER_ADMIN");
  await assignCourier(supplierId, r.orderId, courierId, "SUPPLIER_ADMIN");
  await startDelivery(courierId, r.orderId);
  const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { items: true } });
  await confirmDelivery(courierId, order.id, { items: order.items.map((i) => ({ id: i.id, delivered: qty, accepted: qty })), received: qty * 1000, method: "CASH", qr: order.qrToken! });
  return { shop: s, order };
}

describe.skipIf(!enabled)("средние улучшения: сотрудники магазина, оформить все, зачёт брака, маршрут", () => {
  beforeAll(async () => {
    territoryId = (await db.territory.create({ data: { name: `Район средних ${tag}`, type: "DISTRICT" } })).id;
    const courier = await db.user.create({ data: { phone: `+99893${tag.slice(-7)}`, passwordHash: "-", fullName: "Курьер С" } });
    courierId = courier.id;
    for (const i of [1, 2]) {
      const s = await db.supplier.create({
        data: { legalName: "П", displayName: `С${i} ${tag}`, inn: tag + i, legalAddress: "-", phone: "+998900000009", email: "s@t.uz", contactPerson: "-", officeAddress: "-", officeLat: 41, officeLng: 69, status: "ACTIVE", territories: { create: { territoryId } } },
      });
      const p = await db.product.create({ data: { supplierId: s.id, name: "Сок", units: { create: { kind: "PIECE", price: 1000 } } }, include: { units: true } });
      await db.$transaction((tx) => applyStock(tx, { unitId: p.units[0].id, type: "INITIAL", qty: 500 }, actor));
      suppliers.push({ id: s.id, unitId: p.units[0].id });
    }
    await db.supplierMember.create({ data: { supplierId: suppliers[0].id, userId: courierId, role: "COURIER" } });
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it("М5: «Оформить все» оформляет каждую корзину; не прошедшая проверку остаётся в корзине", async () => {
    const shop = await newShop();
    await addToCart(shop, suppliers[0].id, suppliers[0].unitId, 2);
    await addToCart(shop, suppliers[1].id, suppliers[1].unitId, 1);
    await db.supplier.update({ where: { id: suppliers[1].id }, data: { minOrderTotal: 5000 } });
    const r = await checkoutAll(shop, delivery);
    expect(r.placed).toHaveLength(1);
    expect(r.problems[0]).toMatch(/^Не оформлен заказ С2 .*: Минимальная сумма/);
    expect(await db.order.count({ where: { shopId: shop.id, status: "DRAFT", items: { some: {} } } })).toBe(1);
    await db.supplier.update({ where: { id: suppliers[1].id }, data: { minOrderTotal: null } });
    expect((await checkoutAll(shop, delivery)).placed).toHaveLength(1);
  });

  it("М6: сотрудник добавляется, просит владельца оформить; уведомления о долге — только владельцу", async () => {
    const { shop, owner } = await shopWithOwner();
    const phone = `+99898${tag.slice(-7)}`;
    const { member, tempPassword } = await addShopStaff(shop, "Продавец", phone);
    expect(member.role).toBe("STAFF");
    expect(tempPassword).toBeTruthy();
    await expect(addShopStaff(shop, "Продавец", phone)).rejects.toThrow("уже в команде");
    // Телефон доставщика поставщика добавить нельзя — он попадёт в другой кабинет
    await expect(addShopStaff(shop, "Курьер", `+99893${tag.slice(-7)}`)).rejects.toThrow("у поставщика");

    await addToCart(shop, suppliers[0].id, suppliers[0].unitId, 1);
    expect(await askOwnerToCheckout(shop.id, suppliers[0].id, "Продавец")).toEqual({ sent: true });
    expect(await askOwnerToCheckout(shop.id, suppliers[0].id, "Продавец")).toEqual({ sent: false });
    const asks = await db.notification.findMany({ where: { type: "cart.ask_owner", userId: { in: [owner.id, member.userId] } } });
    expect(asks.map((n) => n.userId)).toEqual([owner.id]);

    await checkout(shop, suppliers[0].id, delivery);
    await correctBalance(suppliers[0].id, shop.id, 500, "тест", null, "SUPPLIER_ADMIN");
    const debtNotes = await db.notification.findMany({ where: { type: "debt.correction", userId: { in: [owner.id, member.userId] } } });
    expect(debtNotes.map((n) => n.userId)).toEqual([owner.id]);

    // Отключение и сброс пароля — только для сотрудников этого магазина
    const off = await toggleShopStaff(shop.id, member.id);
    expect(off.isActive).toBe(false);
    const ownerMember = await db.shopMember.findFirstOrThrow({ where: { shopId: shop.id, role: "OWNER" } });
    await expect(toggleShopStaff(shop.id, ownerMember.id)).rejects.toThrow("не найден");
    const other = await newShop();
    await expect(resetShopStaffPassword(other.id, member.id)).rejects.toThrow("не найден");
    expect((await resetShopStaffPassword(shop.id, member.id)).tempPassword).toBeTruthy();
  });

  it("Л5: зачёт брака уменьшает долг по цене из заказа и снимает резерв согласованной замены", async () => {
    const { shop, order } = await delivered(5);
    const before = Number((await db.shopAccount.findUniqueOrThrow({ where: { shopId_supplierId: { shopId: shop.id, supplierId: suppliers[0].id } } })).balance);
    const item = order.items[0];
    const r = await createReplacement(shop.id, { orderId: order.id, orderItemId: item.id, qty: 2, reason: "Брак", photoPaths: [], videoPaths: [] });
    const unit = () => db.productUnit.findUniqueOrThrow({ where: { id: suppliers[0].unitId } });
    const reserved = Number((await unit()).reservedQty);
    await decideReplacement(suppliers[0].id, r.id, true, null);
    expect(Number((await unit()).reservedQty)).toBe(reserved + 2);
    expect(await creditReplacement(suppliers[0].id, r.id, "без замены", "SUPPLIER_ADMIN")).toEqual({ amount: 2000 });
    expect(Number((await unit()).reservedQty)).toBe(reserved);
    const account = await db.shopAccount.findUniqueOrThrow({ where: { shopId_supplierId: { shopId: shop.id, supplierId: suppliers[0].id } } });
    expect(Number(account.balance)).toBe(before - 2000);
    expect(await db.replacement.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "CREDITED" });
    // Зачтённое количество больше нельзя заявить ещё раз
    await expect(createReplacement(shop.id, { orderId: order.id, orderItemId: item.id, qty: 4, reason: "Брак", photoPaths: [], videoPaths: [] })).rejects.toThrow("не больше 3");
    await expect(creditReplacement(suppliers[0].id, r.id, null, "SUPPLIER_ADMIN")).rejects.toThrow("невыполненную");
  });

  it("Д2: маршрут — ближайшая точка за ближайшей, ручной порядок и сброс", async () => {
    const { id: supplierId, unitId } = suppliers[0];
    const ids: string[] = [];
    // Склад в (41, 69); магазины на 0.3°, 0.1° и 0.2° к северу
    for (const lat of [41.3, 41.1, 41.2]) {
      const s = await newShop(lat, 69);
      await addToCart(s, supplierId, unitId, 1);
      const r = await checkout(s, supplierId, delivery);
      if (!r.placed) throw new Error("not placed");
      await supplierOrderAction(supplierId, r.orderId, "accept", null, "SUPPLIER_ADMIN");
      await makeReady(supplierId, r.orderId, "SUPPLIER_ADMIN");
      await assignCourier(supplierId, r.orderId, courierId, "SUPPLIER_ADMIN");
      ids.push(r.orderId);
    }
    const mine = (route: { id: string }[]) => route.map((o) => o.id).filter((id) => ids.includes(id));
    expect(mine((await courierRoute(supplierId, courierId)).route)).toEqual([ids[1], ids[2], ids[0]]);
    await moveInRoute(supplierId, courierId, ids[0], -1);
    expect(mine((await courierRoute(supplierId, courierId)).route)).toEqual([ids[1], ids[0], ids[2]]);
    await resetRoute(supplierId, courierId);
    expect(mine((await courierRoute(supplierId, courierId)).route)).toEqual([ids[1], ids[2], ids[0]]);
  });
});

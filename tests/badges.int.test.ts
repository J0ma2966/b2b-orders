import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Вне HTTP-запроса сессии нет: действия выполняются «от системы»
vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { addForcedItem, addToCart, checkout, removeForcedItem } from "@/lib/orders";
import { applyStock } from "@/lib/stock";
import { shopBadges, supplierBadges, unreadBySection } from "@/lib/nav-badges";
import { nextSku } from "@/lib/sku";
import { ORDER_CHANGED } from "@/lib/order-core";
import { SHOP_MOBILE_NAV, SHOP_NAV } from "@/components/shell/shop-nav";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
const actor = { userId: null, onBehalfOfUserId: null };
const delivery = { paymentMethod: "CASH" as const, deliveryAddress: "ул. Тестовая, 1", contactName: "Тест", contactPhone: "+998901234567" };
let supplierId = "";
let unitId = "";
let extraId = "";
let shopUserId = "";
let shop: Awaited<ReturnType<typeof db.shop.create>>;

describe.skipIf(!enabled)("счётчики разделов, принудительная продажа, артикул", () => {
  beforeAll(async () => {
    const t = await db.territory.create({ data: { name: `Район бейджей ${tag}`, type: "DISTRICT" } });
    const supplier = await db.supplier.create({
      data: {
        legalName: "Поставщик", displayName: `Поставщик ${tag}`, inn: tag + "7", legalAddress: "-", phone: "+998900000003", email: "b@t.uz", contactPerson: "-", officeAddress: "-",
        status: "ACTIVE", commissionRate: 2, territories: { create: { territoryId: t.id } },
      },
    });
    supplierId = supplier.id;
    const mk = async (name: string, price: number) => {
      const p = await db.product.create({ data: { supplierId, name, units: { create: { kind: "PIECE", price } } }, include: { units: true } });
      await db.$transaction((tx) => applyStock(tx, { unitId: p.units[0].id, type: "INITIAL", qty: 10 }, actor));
      return p.units[0].id;
    };
    unitId = await mk("Сок", 5000);
    extraId = await mk("Печенье", 4000);
    shop = await db.shop.create({ data: { name: `Магазин ${tag}`, phone: "+998901234567", address: "-", lat: 41.3, lng: 69.2, contactName: "-", territoryId: t.id } });
    const user = await db.user.create({ data: { phone: `+99890${tag.slice(-7)}`, passwordHash: "-", fullName: "Владелец", shopMembers: { create: { shopId: shop.id, role: "OWNER" } } } });
    shopUserId = user.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("поставщик добавил товар в заказ: магазин получает уведомление «изменён», счётчик «Заказы» растёт", async () => {
    await addToCart(shop, supplierId, unitId, 2);
    const r = await checkout(shop, supplierId, delivery);
    expect(r.placed).toBe(true);
    const orderId = (r as { orderId: string }).orderId;

    // Корзина пуста — счётчика корзины нет
    let badges = await shopBadges(shopUserId, shop.id, SHOP_NAV.map((i) => i.href), SHOP_MOBILE_NAV.map((i) => i.href));
    expect(badges.bottom["/shop/cart"]).toBe(0);

    await addForcedItem(supplierId, orderId, extraId, 1, "SUPPLIER_ADMIN");
    const notes = await db.notification.findMany({ where: { userId: shopUserId, entityId: orderId } });
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe(ORDER_CHANGED);
    expect(notes[0].title).toContain("поставщик добавил товар");
    expect(notes[0].link).toBe(`/shop/orders/${orderId}`);

    badges = await shopBadges(shopUserId, shop.id, SHOP_NAV.map((i) => i.href), SHOP_MOBILE_NAV.map((i) => i.href));
    expect(badges.bottom["/shop/orders"]).toBe(1);

    // Убрал позицию — ещё одно уведомление того же типа
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId, kind: "FORCED" } });
    await removeForcedItem(supplierId, item.id, "SUPPLIER_ADMIN");
    expect(await db.notification.count({ where: { userId: shopUserId, entityId: orderId, type: ORDER_CHANGED } })).toBe(2);

    // Магазин открыл заказ — уведомления прочитаны, счётчик погас
    await db.notification.updateMany({ where: { userId: shopUserId, link: `/shop/orders/${orderId}` }, data: { readAt: new Date() } });
    expect((await unreadBySection(shopUserId, SHOP_NAV.map((i) => i.href)))["/shop/orders"]).toBeUndefined();
  });

  it("разделы без места в нижней панели собираются в «Профиль»; корзина — число позиций", async () => {
    await db.notification.create({ data: { userId: shopUserId, type: "debt.payment", title: "Погашение", link: "/shop/debts" } });
    await addToCart(shop, supplierId, unitId, 1);
    const b = await shopBadges(shopUserId, shop.id, SHOP_NAV.map((i) => i.href), SHOP_MOBILE_NAV.map((i) => i.href));
    expect(b.side["/shop/debts"]).toBe(1);
    expect(b.bottom["/shop/profile"]).toBe(1);
    expect(b.bottom["/shop/cart"]).toBe(1);
  });

  it("поставщик: «Заказы» — ждущие ответа заказы, уведомления «/courier» идут в «Доставки»", async () => {
    const owner = await db.user.create({ data: { phone: `+99891${tag.slice(-7)}`, passwordHash: "-", fullName: "Поставщик" } });
    await db.notification.create({ data: { userId: owner.id, type: "x", title: "Назначен заказ", link: "/courier" } });
    await db.notification.create({ data: { userId: owner.id, type: "x", title: "Счёт на комиссию", link: "/supplier/commission" } });
    const hrefs = ["/supplier", "/supplier/orders", "/supplier/delivery", "/supplier/stock", "/supplier/commission", "/supplier/more"];
    const b = await supplierBadges(owner.id, supplierId, {
      active: true,
      delivers: false,
      allHrefs: hrefs,
      mobileHrefs: ["/supplier", "/supplier/orders", "/supplier/delivery", "/supplier/stock", "/supplier/more"],
      overflowHref: "/supplier/more",
    });
    expect(b.side["/supplier/orders"]).toBeGreaterThanOrEqual(1); // заказ из первого теста ждёт ответа
    expect(b.side["/supplier/delivery"]).toBe(1);
    expect(b.bottom["/supplier/more"]).toBe(1);
  });

  it("артикул: по порядку, без повторов при одновременном создании, занятые вручную пропускаются", async () => {
    await db.product.create({ data: { supplierId, name: "Ручной", sku: "A-00002" } });
    const skus = await Promise.all(Array.from({ length: 5 }, () => db.$transaction((tx) => nextSku(tx, supplierId))));
    expect(new Set(skus).size).toBe(5);
    expect(skus).not.toContain("A-00002");
    expect([...skus].sort()[0]).toBe("A-00001");
  });
});

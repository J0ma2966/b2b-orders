import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { DELETED_NAME, deleteUserAccount, deletionImpact } from "@/lib/account-deletion";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-7);
let n = 0;
const phone = () => `+99893${tag.slice(-5)}${String(n++).padStart(2, "0")}`;
const user = (fullName: string, extra: object = {}) => db.user.create({ data: { phone: phone(), passwordHash: "-", fullName, email: "me@t.uz", ...extra } });

describe.skipIf(!enabled)("удаление аккаунта (App Store 5.1.1(v), Google Play)", () => {
  let supplierId = "", territoryId = "", shopId = "";

  beforeAll(async () => {
    territoryId = (await db.territory.create({ data: { name: `Район удаления ${tag}`, type: "DISTRICT" } })).id;
    supplierId = (
      await db.supplier.create({
        data: { legalName: "П", displayName: `Удаление ${tag}`, inn: `7${tag}1`, legalAddress: "-", phone: "+998900000001", email: "d@t.uz", contactPerson: "-", officeAddress: "-", status: "ACTIVE", territories: { create: { territoryId } } },
      })
    ).id;
    shopId = (await db.shop.create({ data: { name: `Магазин удаления ${tag}`, phone: "+998901234567", address: "-", lat: 41, lng: 69, contactName: "-", territoryId } })).id;
  });
  afterAll(() => db.$disconnect());

  it("личные данные стираются, вход и push на всех устройствах прекращаются", async () => {
    const u = await user("Иван Курьер");
    const oldPhone = u.phone;
    await db.supplierMember.create({ data: { supplierId, userId: u.id, role: "COURIER" } });
    await db.supplierTerritory.update({ where: { supplierId_territoryId: { supplierId, territoryId } }, data: { courierId: u.id } });
    const session = await db.session.create({ data: { tokenHash: `h${tag}${n++}`, userId: u.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    await db.deviceToken.create({ data: { userId: u.id, sessionId: session.id, platform: "IOS", token: "a".repeat(63) + n } });
    await db.pushSubscription.create({ data: { userId: u.id, endpoint: `https://push.example/${tag}${n++}`, p256dh: "k", auth: "a" } });
    await db.notification.create({ data: { userId: u.id, type: "t", title: "Привет" } });
    await db.loginAttempt.create({ data: { phone: oldPhone, success: false } });

    await deleteUserAccount(u.id);

    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after).toMatchObject({ status: "DELETED", fullName: DELETED_NAME, email: null, pushEnabled: false });
    expect(after.phone).not.toBe(oldPhone);
    expect(after.passwordHash).not.toBe("-");
    expect(after.deletedAt).toBeInstanceOf(Date);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    expect(await db.deviceToken.count({ where: { userId: u.id } })).toBe(0);
    expect(await db.pushSubscription.count({ where: { userId: u.id } })).toBe(0);
    expect(await db.notification.count({ where: { userId: u.id } })).toBe(0);
    expect(await db.loginAttempt.count({ where: { phone: oldPhone } })).toBe(0);
    expect(await db.supplierMember.findFirstOrThrow({ where: { userId: u.id } })).toMatchObject({ isActive: false });
    const st = await db.supplierTerritory.findUniqueOrThrow({ where: { supplierId_territoryId: { supplierId, territoryId } } });
    expect(st.courierId).toBeNull();
    // Телефон свободен для новой регистрации
    await expect(db.user.create({ data: { phone: oldPhone, passwordHash: "-", fullName: "Новый" } })).resolves.toBeTruthy();
    // Повторное удаление ничего не ломает
    await expect(deleteUserAccount(u.id)).resolves.toEqual({ alreadyDeleted: true });
  });

  it("поставщик без управляющих скрывается от магазинов, супер-админ узнаёт об этом", async () => {
    const owner = await user("Владелец");
    const admin = await user("Админ");
    await db.supplierMember.create({ data: { supplierId, userId: owner.id, role: "OWNER" } });
    await db.supplierMember.create({ data: { supplierId, userId: admin.id, role: "ADMIN" } });
    const boss = await user("Супер", { isSuperAdmin: true });

    // Остаётся администратор — поставщик работает дальше
    expect((await deletionImpact(owner.id)).lastInSuppliers).toEqual([]);
    await deleteUserAccount(owner.id);
    let s = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    expect(s).toMatchObject({ hiddenFromShops: false, ordersDisabled: false });

    // Последний управляющий
    expect((await deletionImpact(admin.id)).lastInSuppliers.map((x) => x.id)).toEqual([supplierId]);
    await deleteUserAccount(admin.id);
    s = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    expect(s).toMatchObject({ hiddenFromShops: true, ordersDisabled: true });
    expect(await db.notification.count({ where: { userId: boss.id, type: "account_deleted", entityId: supplierId } })).toBe(1);
  });

  it("магазин: предупреждение для единственного владельца; супер-админ не удаляется", async () => {
    const owner = await user("Хозяин магазина");
    await db.shopMember.create({ data: { shopId, userId: owner.id, role: "OWNER" } });
    expect((await deletionImpact(owner.id)).lastInShops.map((x) => x.id)).toEqual([shopId]);
    const r = await deleteUserAccount(owner.id);
    expect(r).toMatchObject({ alreadyDeleted: false, lastInShops: [{ id: shopId }] });
    // Учётные данные организации остаются
    expect(await db.shop.findUnique({ where: { id: shopId } })).toBeTruthy();

    const boss = await user("Супер 2", { isSuperAdmin: true });
    await expect(deleteUserAccount(boss.id)).rejects.toThrow("Супер-администратор");
  });

  it("токен устройства удаляется вместе с сессией (выход из приложения)", async () => {
    const u = await user("Магазин");
    const session = await db.session.create({ data: { tokenHash: `x${tag}${n++}`, userId: u.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    await db.deviceToken.create({ data: { userId: u.id, sessionId: session.id, platform: "ANDROID", token: `fcm-${tag}-${n++}-token-value` } });
    await db.session.delete({ where: { id: session.id } });
    expect(await db.deviceToken.count({ where: { userId: u.id } })).toBe(0);
  });
});

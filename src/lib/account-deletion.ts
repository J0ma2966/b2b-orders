import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { notifySuperAdmins } from "@/lib/notify";
import type { Prisma } from "@/generated/prisma/client";

// Удаление аккаунта самим пользователем (требование App Store 5.1.1(v) и Google Play).
// Личные данные человека стираются сразу. Заказы, долги, оплаты и чеки — учётные документы
// организаций (магазина и поставщика), они остаются, но без имени и телефона удалённого человека.

export const DELETED_NAME = "Удалённый пользователь";

type Tx = Prisma.TransactionClient;

// Организации, где пользователь — последний, кто ими управляет
export async function deletionImpact(userId: string, tx: Tx | typeof db = db) {
  const [suppliers, shops] = await Promise.all([
    tx.supplierMember.findMany({
      where: { userId, isActive: true, role: { in: ["OWNER", "ADMIN"] } },
      select: { supplier: { select: { id: true, displayName: true, members: { where: { isActive: true, role: { in: ["OWNER", "ADMIN"] }, NOT: { userId } }, select: { id: true } } } } },
    }),
    tx.shopMember.findMany({
      where: { userId, isActive: true, role: "OWNER" },
      select: { shop: { select: { id: true, name: true, members: { where: { isActive: true, role: "OWNER", NOT: { userId } }, select: { id: true } } } } },
    }),
  ]);
  return {
    lastInSuppliers: suppliers.filter((m) => m.supplier.members.length === 0).map((m) => ({ id: m.supplier.id, name: m.supplier.displayName })),
    lastInShops: shops.filter((m) => m.shop.members.length === 0).map((m) => ({ id: m.shop.id, name: m.shop.name })),
  };
}

export async function deleteUserAccount(userId: string) {
  // Случайный пароль считается заранее: bcrypt медленный, транзакцию не держим
  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.isSuperAdmin) throw new Error("Супер-администратор не удаляется из приложения");
    if (user.status === "DELETED") return { alreadyDeleted: true as const };
    const impact = await deletionImpact(userId, tx);

    // Поставщик без управляющих не должен принимать новые заказы: скрываем от магазинов
    for (const s of impact.lastInSuppliers) {
      await tx.supplier.update({ where: { id: s.id }, data: { hiddenFromShops: true, ordersDisabled: true } });
    }
    if (impact.lastInSuppliers.length > 0) {
      await notifySuperAdmins(
        { type: "account_deleted", title: "Владелец поставщика удалил аккаунт", body: impact.lastInSuppliers.map((s) => s.name).join(", "), link: `/admin/suppliers/${impact.lastInSuppliers[0].id}`, entity: "Supplier", entityId: impact.lastInSuppliers[0].id },
        tx,
      );
    }

    await tx.supplierMember.updateMany({ where: { userId }, data: { isActive: false } });
    await tx.shopMember.updateMany({ where: { userId }, data: { isActive: false } });
    await tx.supplierTerritory.updateMany({ where: { courierId: userId }, data: { courierId: null } });
    await tx.session.deleteMany({ where: { OR: [{ userId }, { actingAsUserId: userId }] } });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.deviceToken.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.loginAttempt.deleteMany({ where: { phone: user.phone } });
    await tx.user.update({
      where: { id: userId },
      data: {
        // Телефон освобождается: с ним можно зарегистрироваться заново
        phone: `deleted:${user.id}`,
        fullName: DELETED_NAME,
        email: null,
        passwordHash,
        status: "DELETED",
        deletedAt: new Date(),
        pushEnabled: false,
        mustChangePassword: false,
      },
    });
    return { alreadyDeleted: false as const, ...impact };
  });
}

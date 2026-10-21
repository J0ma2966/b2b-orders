import "server-only";
import { db } from "@/lib/db";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { notifyUsers } from "@/lib/notify";
import { formatMoney } from "@/lib/format";
import { OrderError } from "@/lib/orders";

// М6: сотрудники магазина. Владелец добавляет продавцов: они собирают корзину и принимают товар,
// а оформление, отмену, долги и профиль оставляют владельцу.

export async function addShopStaff(shop: { id: string; name: string }, fullName: string, phone: string) {
  let user = await db.user.findUnique({ where: { phone } });
  let tempPassword: string | null = null;
  if (user) {
    if (user.isSuperAdmin) throw new OrderError("Этот телефон нельзя добавить");
    // Иначе после входа человек попадёт в кабинет поставщика, а не магазина
    if (await db.supplierMember.count({ where: { userId: user.id, isActive: true } })) throw new OrderError("Этот телефон уже работает у поставщика");
    if (await db.shopMember.findUnique({ where: { shopId_userId: { shopId: shop.id, userId: user.id } } })) throw new OrderError("Этот пользователь уже в команде");
  } else {
    tempPassword = generateTempPassword();
    user = await db.user.create({ data: { phone, fullName, passwordHash: await hashPassword(tempPassword), mustChangePassword: true } });
  }
  const member = await db.shopMember.create({ data: { shopId: shop.id, userId: user.id, role: "STAFF" } });
  await notifyUsers([user.id], { type: "shop.member", title: `Вас добавили сотрудником магазина «${shop.name}»`, link: "/shop" });
  return { member, user, tempPassword };
}

// Владелец управляет только сотрудниками, не другими владельцами
async function staffMember(shopId: string, memberId: string) {
  const m = await db.shopMember.findUnique({ where: { id: memberId }, include: { user: true } });
  if (!m || m.shopId !== shopId || m.role !== "STAFF") throw new OrderError("Сотрудник не найден");
  return m;
}

export async function toggleShopStaff(shopId: string, memberId: string) {
  const m = await staffMember(shopId, memberId);
  await db.shopMember.update({ where: { id: m.id }, data: { isActive: !m.isActive } });
  // Отключённый сотрудник сразу теряет доступ к магазину
  if (m.isActive) await db.session.updateMany({ where: { userId: m.userId, activeShopId: shopId }, data: { activeShopId: null } });
  return { ...m, isActive: !m.isActive };
}

export async function resetShopStaffPassword(shopId: string, memberId: string) {
  const m = await staffMember(shopId, memberId);
  const elsewhere =
    (await db.shopMember.count({ where: { userId: m.userId, NOT: { shopId } } })) + (await db.supplierMember.count({ where: { userId: m.userId } }));
  if (elsewhere > 0 || m.user.isSuperAdmin) throw new OrderError("Пользователь работает и в других организациях, пароль он меняет сам");
  const tempPassword = generateTempPassword();
  await db.user.update({ where: { id: m.userId }, data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true } });
  await db.session.deleteMany({ where: { userId: m.userId } });
  return { member: m, tempPassword };
}

// Сотрудник собрал корзину и просит владельца оформить заказ. Не чаще раза в 10 минут на корзину.
export async function askOwnerToCheckout(shopId: string, supplierId: string, staffName: string) {
  const cart = await db.order.findFirst({
    where: { shopId, supplierId, status: "DRAFT", items: { some: {} } },
    include: { supplier: true, _count: { select: { items: true } } },
  });
  if (!cart) throw new OrderError("Корзина пуста");
  const recent = await db.notification.count({
    where: { type: "cart.ask_owner", entityId: cart.id, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } },
  });
  if (recent > 0) return { sent: false };
  const owners = await db.shopMember.findMany({ where: { shopId, role: "OWNER", isActive: true }, select: { userId: true } });
  await notifyUsers(owners.map((o) => o.userId), {
    type: "cart.ask_owner",
    title: `${staffName} просит оформить заказ ${cart.supplier.displayName}`,
    body: `Позиций: ${cart._count.items}, сумма ${formatMoney(Number(cart.total))}`,
    link: `/shop/cart/${supplierId}`,
    entity: "Order",
    entityId: cart.id,
  });
  return { sent: true };
}

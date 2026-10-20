import "server-only";
import { db } from "@/lib/db";
import { getAuth } from "@/lib/auth/current";

// Кто видит заказ (ТЗ п. 61–62): супер-админ, сотрудники поставщика, назначенный доставщик, магазин.
export async function canViewOrder(order: { supplierId: string; shopId: string; courierId: string | null }) {
  const auth = await getAuth();
  if (!auth) return false;
  if (auth.isSuperAdmin) return true;
  const userId = auth.user.id;
  const member = await db.supplierMember.findFirst({ where: { supplierId: order.supplierId, userId, isActive: true } });
  if (member) return member.role !== "COURIER" || order.courierId === userId;
  const shop = await db.shopMember.findFirst({ where: { shopId: order.shopId, userId, isActive: true } });
  return !!shop;
}

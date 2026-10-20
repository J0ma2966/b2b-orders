import "server-only";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAuth } from "@/lib/auth/current";
import { canViewOrder } from "@/lib/order-access";

export async function loadDocumentOrder(id: string) {
  if (!(await getAuth())) redirect("/login");
  const order = await db.order.findUnique({
    where: { id },
    include: { supplier: true, shop: true, courier: true, items: { include: { bonusPromotion: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!order || !["COMPLETED", "PARTIALLY_ACCEPTED"].includes(order.status) || !(await canViewOrder(order))) notFound();
  const account = await db.shopAccount.findUnique({ where: { shopId_supplierId: { shopId: order.shopId, supplierId: order.supplierId } } });
  return { order, balance: Number(account?.balance ?? 0) };
}

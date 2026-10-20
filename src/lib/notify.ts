import "server-only";
import { db } from "@/lib/db";
import { schedulePush } from "@/lib/push";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient | typeof db;

export type NotificationInput = {
  type: string;
  title: string;
  body?: string;
  link?: string;
  entity?: string;
  entityId?: string;
};

// Внутреннее уведомление (колокольчик). Push добавится отдельно и не влияет на хранение.
export async function notifyUsers(userIds: string[], n: NotificationInput, tx: Tx = db) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const created = await tx.notification.createManyAndReturn({ data: unique.map((userId) => ({ userId, ...n })), select: { id: true } });
  schedulePush(created.map((c) => c.id));
}

export async function notifySupplierStaff(
  supplierId: string,
  n: NotificationInput,
  roles: ("OWNER" | "ADMIN" | "COURIER")[] = ["OWNER", "ADMIN"],
  tx: Tx = db,
) {
  const members = await tx.supplierMember.findMany({
    where: { supplierId, isActive: true, role: { in: roles } },
    select: { userId: true },
  });
  await notifyUsers(members.map((m) => m.userId), n, tx);
}

export async function notifySuperAdmins(n: NotificationInput, tx: Tx = db) {
  const admins = await tx.user.findMany({ where: { isSuperAdmin: true, status: "ACTIVE" }, select: { id: true } });
  await notifyUsers(admins.map((a) => a.id), n, tx);
}

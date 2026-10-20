"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/current";

export async function markAllReadAction() {
  const auth = await requireAuth();
  await db.notification.updateMany({ where: { userId: auth.user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function openNotificationAction(formData: FormData) {
  const auth = await requireAuth();
  const n = await db.notification.findUnique({ where: { id: String(formData.get("id") ?? "") } });
  if (!n || n.userId !== auth.user.id) return;
  if (!n.readAt) await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
  // Переход только по внутренним ссылкам
  if (n.link?.startsWith("/") && !n.link.startsWith("//")) redirect(n.link);
}

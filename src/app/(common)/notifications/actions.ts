"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAuth, requireAuth } from "@/lib/auth/current";
import { seenLinks } from "@/lib/nav-badges-core";

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

// Пользователь открыл страницу — уведомления, которые ведут на неё, прочитаны (счётчики разделов гаснут).
// Возвращает, сколько отмечено: если 0 — обновлять страницу не нужно.
export async function markSeenAction(pathname: string): Promise<number> {
  const auth = await getAuth();
  if (!auth || auth.isImpersonating || typeof pathname !== "string" || !pathname.startsWith("/") || pathname.length > 300) return 0;
  const [path, q, hash] = seenLinks(pathname);
  const r = await db.notification.updateMany({
    where: { userId: auth.user.id, readAt: null, OR: [{ link: path }, { link: { startsWith: q } }, { link: { startsWith: hash } }] },
    data: { readAt: new Date() },
  });
  return r.count;
}

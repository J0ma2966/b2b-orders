"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/current";

export async function setPushEnabledAction(enabled: boolean) {
  const auth = await requireAuth();
  await db.user.update({ where: { id: auth.realUser.id }, data: { pushEnabled: enabled } });
  revalidatePath("/account");
}

export async function savePushSubscriptionAction(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const auth = await requireAuth();
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "Неверная подписка" };
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId: auth.realUser.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    create: { userId: auth.realUser.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  await db.user.update({ where: { id: auth.realUser.id }, data: { pushEnabled: true } });
  revalidatePath("/account");
  return { ok: true };
}

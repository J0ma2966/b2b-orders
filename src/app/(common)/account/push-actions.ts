"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAuth, requireAuth } from "@/lib/auth/current";
import { validDeviceToken } from "@/lib/native-push-core";
import { parsePushEndpoint } from "@/lib/ssrf";

export async function setPushEnabledAction(enabled: boolean) {
  const auth = await requireAuth();
  await db.user.update({ where: { id: auth.realUser.id }, data: { pushEnabled: enabled } });
  revalidatePath("/account");
}

export async function savePushSubscriptionAction(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const auth = await requireAuth();
  // Адрес задаёт браузер, но сервер потом сам к нему обращается — проверяем, что это https
  // и публичный хост, иначе подписку можно было бы навести на внутреннюю сеть (SSRF).
  if (!parsePushEndpoint(sub?.endpoint ?? "").ok || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "Неверная подписка" };
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId: auth.realUser.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    create: { userId: auth.realUser.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  await db.user.update({ where: { id: auth.realUser.id }, data: { pushEnabled: true } });
  revalidatePath("/account");
  return { ok: true };
}

// Мобильное приложение: токен устройства для push. Привязан к текущей сессии и удаляется при выходе.
export async function saveDeviceTokenAction(input: { platform: "android" | "ios"; token: string }) {
  const auth = await getAuth();
  if (!auth || auth.isImpersonating) return { error: "Нет входа" };
  const platform = input?.platform === "ios" ? ("IOS" as const) : input?.platform === "android" ? ("ANDROID" as const) : null;
  if (!platform || !validDeviceToken(platform, input.token)) return { error: "Неверный токен устройства" };
  const data = { userId: auth.realUser.id, sessionId: auth.session.id, platform };
  await db.deviceToken.upsert({ where: { token: input.token }, update: data, create: { ...data, token: input.token } });
  return { ok: true };
}

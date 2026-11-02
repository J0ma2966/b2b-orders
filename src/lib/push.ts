import "server-only";
import webpush from "web-push";
import { db } from "@/lib/db";
import { makeT, parseLocale } from "@/lib/i18n/core";
import { nativePushConfigured, sendNativePush } from "@/lib/native-push";

// Web Push (ТЗ п. 57). Без ключей VAPID push отключён, внутренние уведомления работают всегда.
const pub = process.env.VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
const webPushConfigured = !!(pub && priv);
export const pushConfigured = webPushConfigured || nativePushConfigured.android || nativePushConfigured.ios;
if (webPushConfigured) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.uz", pub!, priv!);

export function vapidPublicKey() {
  return pub ?? null;
}

// Отправляется после фиксации транзакции: если уведомление откатилось вместе с операцией, push не уйдёт.
export function schedulePush(notificationIds: string[]) {
  if (!pushConfigured || notificationIds.length === 0) return;
  setTimeout(() => {
    sendPush(notificationIds).catch((e) => console.error("push", e));
  }, 300);
}

async function sendPush(ids: string[]) {
  const notes = await db.notification.findMany({ where: { id: { in: ids } }, include: { user: { include: { pushSubscriptions: true, deviceTokens: true } } } });
  for (const n of notes) {
    if (!n.user.pushEnabled) continue;
    const t = makeT(parseLocale(n.user.locale) ?? "ru");
    // Мобильное приложение (Android, iOS)
    await sendNativePush(n.user.deviceTokens, { title: t(n.title), body: t(n.body), url: n.link ?? "/notifications" });
    if (!webPushConfigured) continue;
    for (const s of n.user.pushSubscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: t(n.title), body: t(n.body), url: n.link ?? "/notifications" }),
          { TTL: 3600 },
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // Подписка больше не действует
        if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => null);
      }
    }
  }
}

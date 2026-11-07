import { createSign, sign as cryptoSign } from "node:crypto";
import { safePath } from "./push-path";

// Push в мобильном приложении без сторонних библиотек: FCM HTTP v1 (Android) и APNs (iOS).
// Здесь — чистые функции (подписи, тела запросов, разбор ответов), отправка — в native-push.ts.

export type PushMessage = { title: string; body: string; url: string };

export const ANDROID_CHANNEL = "orders";

const b64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");

// Сервисный аккаунт Firebase → JWT для обмена на токен доступа Google OAuth (RS256)
export function googleAssertion(account: { client_email: string; private_key: string }, nowSec: number) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(account.private_key).toString("base64url")}`;
}

// Ключ .p8 из Apple Developer → JWT провайдера APNs (ES256, подпись в формате r||s)
export function apnsJwt(key: { keyId: string; teamId: string; privateKey: string }, nowSec: number) {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: key.keyId }));
  const claims = b64url(JSON.stringify({ iss: key.teamId, iat: nowSec }));
  const signature = cryptoSign("sha256", Buffer.from(`${header}.${claims}`), { key: key.privateKey, dsaEncoding: "ieee-p1363" });
  return `${header}.${claims}.${signature.toString("base64url")}`;
}

export function fcmBody(token: string, m: PushMessage) {
  return {
    message: {
      token,
      notification: { title: m.title, body: m.body },
      data: { url: safePath(m.url) },
      // Канал «orders» с высокой важностью — уведомление всплывает поверх экрана (создаёт приложение, native-push.ts)
      android: { priority: "HIGH", ttl: "3600s", notification: { sound: "default", channel_id: ANDROID_CHANNEL } },
    },
  };
}

export function apnsBody(m: PushMessage) {
  return { aps: { alert: { title: m.title, body: m.body }, sound: "default" }, url: safePath(m.url) };
}

// Токен больше не действует (приложение удалено, токен обновился) — его надо удалить из базы
export function fcmTokenGone(status: number, body: string) {
  if (status === 404) return true;
  return status === 400 && /UNREGISTERED|registration token is not a valid/i.test(body);
}

export function apnsTokenGone(status: number, body: string) {
  if (status === 410) return true;
  return status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(body);
}

// Токены FCM — длинные строки из [A-Za-z0-9:_-], APNs — 64 шестнадцатеричных символа
export function validDeviceToken(platform: "ANDROID" | "IOS", token: unknown): token is string {
  if (typeof token !== "string") return false;
  return platform === "IOS" ? /^[0-9a-f]{64}$/i.test(token) : /^[A-Za-z0-9:_-]{20,4096}$/.test(token);
}

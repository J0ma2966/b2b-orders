import "server-only";
import { readFileSync } from "node:fs";
import { connect, type ClientHttp2Session } from "node:http2";
import { db } from "@/lib/db";
import { apnsBody, apnsJwt, apnsTokenGone, fcmBody, fcmTokenGone, googleAssertion, type PushMessage } from "./native-push-core";

// Push в мобильном приложении. Android — Firebase Cloud Messaging, iOS — Apple Push Notification service.
// Ключи только в переменных окружения сервера (см. docs/mobile.md); без них push в приложении выключен.

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function readSecret(value: string | undefined, file: string | undefined) {
  if (value) return value;
  if (file) return readFileSync(file, "utf8");
  return null;
}

function loadFcm(): ServiceAccount | null {
  const raw = readSecret(process.env.FCM_SERVICE_ACCOUNT, process.env.FCM_SERVICE_ACCOUNT_FILE);
  if (!raw) return null;
  try {
    const acc = JSON.parse(raw) as ServiceAccount;
    return acc.project_id && acc.client_email && acc.private_key ? acc : null;
  } catch {
    console.error("FCM_SERVICE_ACCOUNT: неверный JSON сервисного аккаунта");
    return null;
  }
}

function loadApns() {
  const privateKey = readSecret(process.env.APNS_KEY, process.env.APNS_KEY_FILE)?.replace(/\\n/g, "\n");
  const { APNS_KEY_ID: keyId, APNS_TEAM_ID: teamId, APNS_BUNDLE_ID: bundleId } = process.env;
  if (!privateKey || !keyId || !teamId || !bundleId) return null;
  return { privateKey, keyId, teamId, bundleId, production: process.env.APNS_PRODUCTION === "1" };
}

const fcm = loadFcm();
const apns = loadApns();

export const nativePushConfigured = { android: !!fcm, ios: !!apns };

let googleToken: { value: string; until: number } | null = null;

async function googleAccessToken(acc: ServiceAccount) {
  if (googleToken && googleToken.until > Date.now()) return googleToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: googleAssertion(acc, Math.floor(Date.now() / 1000)),
    }),
  });
  if (!res.ok) throw new Error(`FCM OAuth ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  googleToken = { value: data.access_token, until: Date.now() + (data.expires_in - 300) * 1000 };
  return googleToken.value;
}

async function sendFcm(token: string, m: PushMessage): Promise<boolean> {
  const access = await googleAccessToken(fcm!);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${fcm!.project_id}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify(fcmBody(token, m)),
  });
  if (res.ok) return true;
  const text = await res.text();
  if (fcmTokenGone(res.status, text)) return false;
  throw new Error(`FCM ${res.status}: ${text}`);
}

// Apple просит обновлять JWT не чаще раза в 20 минут и не реже раза в час
let apnsToken: { value: string; until: number } | null = null;
let apnsSession: ClientHttp2Session | null = null;

function apnsAuth() {
  if (apnsToken && apnsToken.until > Date.now()) return apnsToken.value;
  apnsToken = { value: apnsJwt(apns!, Math.floor(Date.now() / 1000)), until: Date.now() + 40 * 60_000 };
  return apnsToken.value;
}

function apnsConnection() {
  if (apnsSession && !apnsSession.closed && !apnsSession.destroyed) return apnsSession;
  apnsSession = connect(apns!.production ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com");
  apnsSession.on("error", () => (apnsSession = null));
  apnsSession.on("goaway", () => (apnsSession = null));
  apnsSession.unref();
  return apnsSession;
}

function sendApns(token: string, m: PushMessage): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const req = apnsConnection().request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${apnsAuth()}`,
      "apns-topic": apns!.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 3600),
      "content-type": "application/json",
    });
    let status = 0;
    let text = "";
    req.setEncoding("utf8");
    req.on("response", (h) => (status = Number(h[":status"])));
    req.on("data", (chunk) => (text += chunk));
    req.on("error", reject);
    req.on("end", () => {
      if (status === 200) resolve(true);
      else if (apnsTokenGone(status, text)) resolve(false);
      else reject(new Error(`APNs ${status}: ${text}`));
    });
    req.end(JSON.stringify(apnsBody(m)));
  });
}

export async function sendNativePush(tokens: { id: string; platform: "ANDROID" | "IOS"; token: string }[], m: PushMessage) {
  for (const t of tokens) {
    const send = t.platform === "IOS" ? (apns ? sendApns : null) : fcm ? sendFcm : null;
    if (!send) continue;
    try {
      if (!(await send(t.token, m))) await db.deviceToken.delete({ where: { id: t.id } }).catch(() => null);
    } catch (e) {
      console.error("native push", e);
    }
  }
}

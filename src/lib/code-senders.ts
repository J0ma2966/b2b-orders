import "server-only";

// Отправка кодов входа: бот Telegram, Telegram Gateway (код от официального аккаунта Telegram
// прямо на номер) и SMS через Eskiz (eskiz.uz). Какие способы доступны — по переменным в .env.

const env = (k: string) => process.env[k]?.trim() || "";
const TG_API = () => env("TELEGRAM_API") || "https://api.telegram.org";

export const telegramBotConfigured = () => !!env("TELEGRAM_LOGIN_BOT_TOKEN");
export const telegramGatewayConfigured = () => !!env("TELEGRAM_GATEWAY_TOKEN");
export const smsConfigured = () => !!(env("ESKIZ_EMAIL") && env("ESKIZ_PASSWORD"));

// Gateway важнее бота: код приходит без подключения бота
export function telegramMode(): "gateway" | "bot" | null {
  if (telegramGatewayConfigured()) return "gateway";
  if (telegramBotConfigured()) return "bot";
  return null;
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; description?: string; error?: string } | null;
  return { status: res.status, data };
}

// ---- Бот ----

export async function botCall(method: string, payload: Record<string, unknown>) {
  const token = env("TELEGRAM_LOGIN_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_LOGIN_BOT_TOKEN не задан");
  const { status, data } = await postJson(`${TG_API()}/bot${token}/${method}`, payload);
  if (!data?.ok) throw new Error(`Telegram ${method}: ${status} ${data?.description ?? ""}`.trim());
  return data.result;
}

let usernameCache: string | null = null;
export async function botUsername() {
  const fromEnv = env("TELEGRAM_LOGIN_BOT_USERNAME").replace(/^@/, "");
  if (fromEnv) return fromEnv;
  if (!usernameCache) usernameCache = ((await botCall("getMe", {})) as { username: string }).username;
  return usernameCache;
}

export function botSend(chatId: string, text: string, replyMarkup?: Record<string, unknown>) {
  return botCall("sendMessage", { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

// ---- Telegram Gateway (https://core.telegram.org/gateway) ----

export async function gatewaySend(phone: string, code: string, ttlSec: number) {
  const { status, data } = await postJson(
    "https://gatewayapi.telegram.org/sendVerificationMessage",
    { phone_number: phone, code, ttl: ttlSec },
    { authorization: `Bearer ${env("TELEGRAM_GATEWAY_TOKEN")}` },
  );
  if (!data?.ok) throw new Error(`Telegram Gateway: ${status} ${data?.error ?? ""}`.trim());
}

// ---- SMS: Eskiz (https://documenter.getpostman.com/view/663428/RzfmES4z) ----

const ESKIZ = () => env("ESKIZ_API") || "https://notify.eskiz.uz/api";
let eskizToken: string | null = null;

async function eskizLogin() {
  const form = new FormData();
  form.set("email", env("ESKIZ_EMAIL"));
  form.set("password", env("ESKIZ_PASSWORD"));
  const res = await fetch(`${ESKIZ()}/auth/login`, { method: "POST", body: form, signal: AbortSignal.timeout(10_000) });
  const data = (await res.json().catch(() => null)) as { data?: { token?: string } } | null;
  if (!res.ok || !data?.data?.token) throw new Error(`Eskiz: вход не удался (${res.status})`);
  eskizToken = data.data.token;
  return eskizToken;
}

export async function smsSend(phone: string, text: string) {
  const send = async (token: string) => {
    const form = new FormData();
    form.set("mobile_phone", phone.replace(/\D/g, ""));
    form.set("message", text);
    form.set("from", env("ESKIZ_FROM") || "4546");
    return fetch(`${ESKIZ()}/message/sms/send`, {
      method: "POST",
      body: form,
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
  };
  let res = await send(eskizToken ?? (await eskizLogin()));
  // Токен Eskiz живёт 30 дней: истёк — входим заново и повторяем один раз
  if (res.status === 401) res = await send(await eskizLogin());
  if (!res.ok) throw new Error(`Eskiz: отправка не удалась (${res.status} ${(await res.text().catch(() => "")).slice(0, 200)})`);
}

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { normalizePhone } from "./phone";

// Вход по одноразовому коду (Telegram или SMS). Здесь — чистые функции и константы,
// работа с базой и отправка — в login-code.ts.

export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 5 * 60 * 1000;
// Ссылка на бота (человек ещё не подключил Telegram) живёт дольше кода: нужно открыть бота и поделиться номером
export const LINK_TTL_MS = 15 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const MAX_CODES_PER_PHONE = 5;
export const MAX_CODES_PER_IP = 20;
export const MAX_ATTEMPTS_PER_CODE = 5;
// После входа по коду можно задать новый пароль без старого («Забыли пароль?»)
export const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000;

export function generateCode() {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

export function generateLinkToken() {
  // Параметр /start у Telegram: до 64 символов A-Z a-z 0-9 _ -
  return randomBytes(18).toString("base64url");
}

// Хеш привязан к записи: одинаковые коды разных людей дают разные хеши
export function hashCode(recordId: string, code: string) {
  return createHash("sha256").update(`${recordId}:${code}`).digest("hex");
}

export function codeMatches(recordId: string, code: string, hash: string) {
  const a = Buffer.from(hashCode(recordId, code));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Пользователь вводит код с пробелами или дефисом («123 456») — оставляем цифры
export function cleanCode(input: string) {
  const digits = input.replace(/\D/g, "");
  return digits.length === CODE_LENGTH ? digits : null;
}

export function botLink(username: string, token: string) {
  return `https://t.me/${username}?start=${token}`;
}

// ---- Telegram ----

export type TgUpdate = {
  update_id?: number;
  message?: {
    chat?: { id?: number | string; type?: string };
    from?: { id?: number | string; language_code?: string; is_bot?: boolean };
    text?: string;
    contact?: { phone_number?: string; user_id?: number | string };
  };
};

export type ParsedTgMessage =
  | { kind: "start"; chatId: string; token: string | null; lang: "ru" | "uz" }
  | { kind: "contact"; chatId: string; phone: string | null; own: boolean; lang: "ru" | "uz" }
  | { kind: "other"; chatId: string; lang: "ru" | "uz" };

// Разбор входящего сообщения боту. Пишем только в личные чаты: группы и каналы пропускаем.
export function parseTgUpdate(update: TgUpdate): ParsedTgMessage | null {
  const m = update?.message;
  const chatId = m?.chat?.id;
  if (!m || chatId === undefined || chatId === null || m.chat?.type !== "private" || m.from?.is_bot) return null;
  const id = String(chatId);
  const lang = m.from?.language_code?.toLowerCase().startsWith("uz") ? "uz" : "ru";
  if (m.contact) {
    // Кнопка «Поделиться номером» присылает номер владельца аккаунта (user_id совпадает с отправителем).
    // Чужой контакт, пересланный или выбранный из записной книжки, для входа не годится.
    const own = m.contact.user_id !== undefined && String(m.contact.user_id) === String(m.from?.id);
    return { kind: "contact", chatId: id, phone: normalizePhone(m.contact.phone_number ?? ""), own, lang };
  }
  const text = m.text?.trim() ?? "";
  const start = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/.exec(text);
  if (start) return { kind: "start", chatId: id, token: start[1] ?? null, lang };
  return { kind: "other", chatId: id, lang };
}

// Тексты бота (ключи — русские строки, перевод — src/lib/i18n/uz.ts)
export const BOT_TEXT = {
  shareButton: "📱 Поделиться номером",
  askContact: "Чтобы получать коды для входа, нажмите кнопку «Поделиться номером» ниже.",
  welcome: "Здесь приходят коды для входа на платформу OptoLink. Нажмите кнопку «Поделиться номером» ниже, чтобы подключить свой номер.",
  notOwn: "Нужен ваш собственный номер. Нажмите кнопку «Поделиться номером» ниже.",
  notRegistered: "Номер {phone} не зарегистрирован на платформе.",
  linked: "Готово: Telegram подключён к номеру {phone}. Коды для входа будут приходить сюда.",
  mismatch: "Номер в Telegram ({phone}) не совпадает с номером, который вы ввели при входе. Войдите с этим номером или получите код по SMS.",
  expired: "Ссылка устарела. Запросите код на странице входа ещё раз.",
  code: "Код для входа: {code}",
  codeHint: "Никому его не сообщайте. Код действует 5 минут.",
} as const;

export function smsText(code: string, template = process.env.SMS_TEMPLATE) {
  // Шаблон SMS у провайдера (Eskiz) проходит модерацию — текст должен совпадать с одобренным
  const t = template?.includes("{code}") ? template : "Kod dlya vhoda: {code}";
  return t.replace("{code}", code);
}

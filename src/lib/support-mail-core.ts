// Почта техподдержки: чистые функции без сети и базы (разбор настроек, письма, текста уведомления)
import { readFileSync } from "node:fs";

export type SupportMailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  mailbox: string;
};

const readFile = (path: string) => {
  try {
    return readFileSync(path, "utf8").replace(/\r?\n$/, "");
  } catch {
    return "";
  }
};

// Настройки из окружения. Без хоста, логина или пароля приём почты выключен.
// Пароль — в SUPPORT_IMAP_PASSWORD или в файле SUPPORT_IMAP_PASSWORD_FILE (так его пишет b2b-support-mail:
// в файле не нужно экранировать спецсимволы, и пароля нет в .env)
export function supportMailConfig(env: Record<string, string | undefined> = process.env, read = readFile): SupportMailConfig | null {
  const host = env.SUPPORT_IMAP_HOST?.trim();
  const user = env.SUPPORT_IMAP_USER?.trim();
  const password = env.SUPPORT_IMAP_PASSWORD || (env.SUPPORT_IMAP_PASSWORD_FILE?.trim() ? read(env.SUPPORT_IMAP_PASSWORD_FILE.trim()) : "");
  if (!host || !user || !password) return null;
  const port = Number(env.SUPPORT_IMAP_PORT) || 993;
  // 993 — сразу TLS; на 143 соединение поднимается до TLS командой STARTTLS
  const secure = env.SUPPORT_IMAP_SECURE ? env.SUPPORT_IMAP_SECURE !== "0" : port === 993;
  return { host, port, secure, user, password, mailbox: env.SUPPORT_IMAP_MAILBOX?.trim() || "INBOX" };
}

// Самое большое письмо, которое скачивается целиком. Больше — сохраняем только заголовок.
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
// Сколько текста письма храним
export const MAX_TEXT = 20_000;
// Сколько писем забираем за одну проверку (остальные — в следующую)
export const BATCH = 50;
// При первом подключении: письма за последние дни, не больше этого числа, без уведомлений о каждом
export const FIRST_RUN_DAYS = 7;
export const FIRST_RUN_LIMIT = 20;
// Сколько отдельных уведомлений за одну проверку; остальные письма — одним общим
export const NOTIFY_EACH = 5;

export type ParsedAddress = { address?: string | null; name?: string | null };

export type IncomingMail = {
  uid: number;
  uidValidity: string;
  messageId?: string | null;
  from?: ParsedAddress | null;
  replyTo?: ParsedAddress | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  date?: Date | null;
  attachments?: { filename?: string | null; size?: number | null; contentType?: string | null }[];
  tooLarge?: boolean;
};

export type SupportEmailRecord = {
  messageKey: string;
  uid: number;
  fromAddress: string | null;
  fromName: string | null;
  replyTo: string | null;
  subject: string;
  text: string;
  attachments: { name: string; size: number; type: string }[] | undefined;
  receivedAt: Date;
};

// Текст из HTML для писем без текстовой части. HTML письма нигде не показывается как разметка.
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const clean = (s: string | null | undefined, max: number) => {
  // Управляющие символы (кроме переноса строки и табуляции) из писем не храним
  const v = (s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return v.length > max ? v.slice(0, max) : v;
};

const addr = (a: ParsedAddress | null | undefined) => {
  const v = clean(a?.address, 320).toLowerCase();
  return v && /^[^\s@<>]+@[^\s@<>]+$/.test(v) ? v : null;
};

export function toRecord(m: IncomingMail, now = new Date()): SupportEmailRecord {
  const messageId = clean(m.messageId, 500);
  let text = m.text?.trim() ? m.text : m.html ? htmlToText(m.html) : "";
  if (m.tooLarge) text = "Письмо слишком большое для просмотра на платформе. Откройте его в почте.";
  text = clean(text, MAX_TEXT);
  const attachments = (m.attachments ?? []).map((a) => ({
    name: clean(a.filename, 200) || "без имени",
    size: Math.max(0, Number(a.size) || 0),
    type: clean(a.contentType, 100),
  }));
  const date = m.date && !Number.isNaN(m.date.getTime()) && m.date.getTime() <= now.getTime() + 86_400_000 ? m.date : now;
  return {
    messageKey: messageId || `${m.uidValidity}:${m.uid}`,
    uid: m.uid,
    fromAddress: addr(m.from),
    fromName: clean(m.from?.name, 200) || null,
    replyTo: addr(m.replyTo),
    subject: clean(m.subject, 500) || "(без темы)",
    text: text || "(пустое письмо)",
    attachments: attachments.length ? attachments : undefined,
    receivedAt: date,
  };
}

export function senderLabel(r: { fromName: string | null; fromAddress: string | null }) {
  if (r.fromName && r.fromAddress) return `${r.fromName} <${r.fromAddress}>`;
  return r.fromName || r.fromAddress || "Неизвестный отправитель";
}

export function snippet(text: string, max = 160) {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

// Ссылка «Ответить письмом»: открывает почтовую программу с адресом и темой «Re: …»
export function replyMailto(r: { replyTo: string | null; fromAddress: string | null; subject: string }) {
  const to = r.replyTo || r.fromAddress;
  if (!to) return null;
  const subject = /^re:/i.test(r.subject) ? r.subject : `Re: ${r.subject}`;
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}`;
}

// Какие UID забрать при этой проверке. lastUid = null — первое подключение (или ящик пересоздан).
export function uidsToFetch(all: number[], lastUid: number | null, firstRunLimit = FIRST_RUN_LIMIT, batch = BATCH) {
  const sorted = [...new Set(all)].sort((a, b) => a - b);
  if (lastUid === null) return sorted.slice(-firstRunLimit);
  return sorted.filter((u) => u > lastUid).slice(0, batch);
}

// Понятный текст ошибки IMAP для страницы «Поддержка» (без паролей и внутренних подробностей)
export function describeImapError(e: unknown): string {
  const err = e as { authenticationFailed?: boolean; code?: string; responseText?: string; message?: string };
  if (err?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed/i.test(`${err?.responseText ?? ""} ${err?.message ?? ""}`)) {
    return "Почта не приняла логин или пароль. Для Яндекса и Gmail нужен пароль приложения, и в настройках ящика должен быть включён IMAP.";
  }
  if (err?.code === "ENOTFOUND" || err?.code === "EAI_AGAIN") return "Не найден IMAP-сервер. Проверьте адрес сервера почты.";
  if (err?.code === "ECONNREFUSED" || err?.code === "ETIMEDOUT" || err?.code === "ECONNRESET") return "Не удалось подключиться к IMAP-серверу. Проверьте адрес и порт.";
  if (err?.code === "NoMailbox" || /Mailbox doesn't exist|NONEXISTENT/i.test(err?.responseText ?? "")) return "В ящике нет такой папки. Проверьте SUPPORT_IMAP_MAILBOX.";
  return "Не удалось проверить почту. Подробности в журнале сервера.";
}

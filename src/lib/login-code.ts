import "server-only";
import { db } from "@/lib/db";
import { Prisma, type CodeChannel } from "@/generated/prisma/client";
import { isTxTimeout } from "@/lib/auth/login-attempts";
import { formatPhone } from "@/lib/phone";
import { parseLocale, translate, type Locale } from "@/lib/i18n/core";
import {
  BOT_TEXT,
  CODE_TTL_MS,
  LIMIT_WINDOW_MS,
  LINK_TTL_MS,
  MAX_ATTEMPTS_PER_CODE,
  MAX_CODES_PER_IP,
  MAX_CODES_PER_PHONE,
  RESEND_COOLDOWN_MS,
  botLink,
  codeMatches,
  generateCode,
  generateLinkToken,
  hashCode,
  parseTgUpdate,
  smsText,
  type TgUpdate,
} from "@/lib/login-code-core";
import { botSend, botUsername, gatewaySend, smsConfigured, smsSend, telegramMode } from "@/lib/code-senders";

export function codeChannels() {
  return { telegram: telegramMode(), sms: smsConfigured() };
}

export type RequestResult =
  | { ok: true; botUrl: string | null }
  | { ok: false; error: string; retryInSec?: number };

// Запрос кода. Ответ не зависит от того, есть ли такой номер на платформе: иначе по форме
// можно было бы перебирать, чьи номера зарегистрированы. Незарегистрированным код не отправляется.
export async function requestLoginCode(phone: string, channel: CodeChannel, ip: string | null): Promise<RequestResult> {
  const channels = codeChannels();
  if (channel === "TELEGRAM" ? !channels.telegram : !channels.sms) return { ok: false, error: "Этот способ получения кода не настроен" };

  const now = Date.now();
  const since = new Date(now - LIMIT_WINDOW_MS);
  const found = await db.user.findUnique({ where: { phone } });
  const user = found?.status === "ACTIVE" ? found : null;
  const viaBot = channel === "TELEGRAM" && channels.telegram === "bot";

  // Подсчёт лимитов и создание записи — под блокировкой на адрес и на номер. Без неё залп
  // одновременных запросов проходил проверку «не чаще раза в минуту, не больше 5 в час»
  // раньше, чем появлялась первая запись, и на номер уходили десятки SMS сразу.
  const reserved = await db
    .$transaction(async (tx): Promise<RequestResult | { record: { id: string; linkToken: string | null } }> => {
      if (ip) await tx.$executeRaw`SELECT pg_advisory_xact_lock(1, hashtext(${ip}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${phone}))`;
      const last = await tx.loginCode.findFirst({ where: { phone, purpose: "LOGIN" }, orderBy: { createdAt: "desc" } });
      const perPhone = await tx.loginCode.count({ where: { phone, purpose: "LOGIN", createdAt: { gte: since } } });
      const perIp = ip ? await tx.loginCode.count({ where: { ip, createdAt: { gte: since } } }) : 0;
      if (last && now - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
        const retryInSec = Math.ceil((RESEND_COOLDOWN_MS - (now - last.createdAt.getTime())) / 1000);
        return { ok: false, error: "Новый код можно запросить через {n} сек.", retryInSec };
      }
      if (perPhone >= MAX_CODES_PER_PHONE || perIp >= MAX_CODES_PER_IP) {
        return { ok: false, error: "Слишком много запросов кода. Попробуйте через час." };
      }
      const record = await tx.loginCode.create({
        data: {
          phone,
          userId: user?.id,
          channel,
          ip,
          linkToken: viaBot ? generateLinkToken() : null,
          expiresAt: new Date(now + (viaBot ? LINK_TTL_MS : CODE_TTL_MS)),
        },
      });
      return { record };
    })
    .catch((e): RequestResult => {
      // Поток запросов на один номер: очередь на блокировку не дождалась — это тоже отказ
      if (isTxTimeout(e)) return { ok: false, error: "Слишком много запросов кода. Попробуйте через час." };
      throw e;
    });
  if (!("record" in reserved)) return reserved;
  const { record } = reserved;

  try {
    if (viaBot) {
      // Бот уже подключён — код приходит сразу; иначе он придёт, когда человек поделится номером в боте
      if (user?.telegramChatId) await sendCodeToChat(record.id, user.telegramChatId, user.locale);
      return { ok: true, botUrl: botLink(await botUsername(), record.linkToken!) };
    }
    if (user) {
      const code = generateCode();
      await db.loginCode.update({ where: { id: record.id }, data: { codeHash: hashCode(record.id, code), sentAt: new Date() } });
      if (channel === "SMS") await smsSend(phone, smsText(code));
      else await gatewaySend(phone, code, CODE_TTL_MS / 1000);
    }
    return { ok: true, botUrl: null };
  } catch (e) {
    console.error("[login-code] send failed", e);
    await db.loginCode.update({ where: { id: record.id }, data: { expiresAt: new Date() } });
    return { ok: false, error: "Не удалось отправить код. Попробуйте позже или выберите другой способ." };
  }
}

// Новый код в чат бота. Код действует 5 минут с момента отправки.
async function sendCodeToChat(recordId: string, chatId: string, locale: string) {
  const code = generateCode();
  await db.loginCode.update({
    where: { id: recordId },
    data: { codeHash: hashCode(recordId, code), chatId, sentAt: new Date(), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  const lang = parseLocale(locale) ?? "ru";
  await botSend(chatId, `${translate(lang, BOT_TEXT.code, { code })}\n${translate(lang, BOT_TEXT.codeHint)}`);
}

// Проверка кода. Возвращает пользователя или null; неудачи считает вызывающий (журнал входов).
export async function verifyLoginCode(phone: string, code: string) {
  const candidates = await db.loginCode.findMany({
    where: { phone, purpose: "LOGIN", usedAt: null, codeHash: { not: null }, expiresAt: { gt: new Date() }, attempts: { lt: MAX_ATTEMPTS_PER_CODE } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  if (candidates.length === 0) return null;
  // Сначала списываем попытку, потом сравниваем — и только с теми кодами, у которых попытка
  // ещё оставалась. Иначе залп одновременных запросов успевал прочитать «попыток меньше пяти»
  // раньше, чем счётчик вырастет, и перебирал сотни вариантов одного кода.
  const live = await db.$queryRaw<{ id: string }[]>`
    UPDATE "LoginCode" SET attempts = attempts + 1
    WHERE id IN (${Prisma.join(candidates.map((c) => c.id))}) AND attempts < ${MAX_ATTEMPTS_PER_CODE} AND "usedAt" IS NULL
    RETURNING id`;
  const allowed = new Set(live.map((r) => r.id));
  const hit = candidates.find((c) => allowed.has(c.id) && codeMatches(c.id, code, c.codeHash!));
  if (!hit) return null;
  // Условное обновление: один код — один вход, даже при двух одновременных отправках формы
  const used = await db.loginCode.updateMany({ where: { id: hit.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count !== 1) return null;
  const user = await db.user.findUnique({ where: { phone } });
  return user?.status === "ACTIVE" ? user : null;
}

// ---- Привязка Telegram из профиля ----

export async function createTelegramLink(userId: string, phone: string) {
  if (codeChannels().telegram !== "bot") return null;
  const record = await db.loginCode.create({
    data: { phone, userId, purpose: "LINK", channel: "TELEGRAM", linkToken: generateLinkToken(), expiresAt: new Date(Date.now() + LINK_TTL_MS) },
  });
  return botLink(await botUsername(), record.linkToken!);
}

// ---- Сообщения боту (вебхук) ----

const shareKeyboard = (lang: Locale) => ({
  keyboard: [[{ text: translate(lang, BOT_TEXT.shareButton), request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
});
const noKeyboard = { remove_keyboard: true };

export async function handleTelegramUpdate(update: TgUpdate) {
  const msg = parseTgUpdate(update);
  if (!msg) return;
  const t = (lang: Locale, text: string, params?: Record<string, string>) => translate(lang, text, params);

  if (msg.kind === "start") {
    if (msg.token) {
      const rec = await db.loginCode.findUnique({ where: { linkToken: msg.token } });
      if (!rec || rec.usedAt || rec.expiresAt < new Date()) return botSend(msg.chatId, t(msg.lang, BOT_TEXT.expired));
      // Ссылку открыли в этом чате; номер ещё нужно подтвердить кнопкой — ссылкой мог поделиться кто угодно
      await db.loginCode.update({ where: { id: rec.id }, data: { chatId: msg.chatId } });
      const owner = await db.user.findUnique({ where: { telegramChatId: msg.chatId } });
      if (owner && owner.phone === rec.phone && owner.status === "ACTIVE") {
        // Нажали «Старт» по ссылке со страницы входа — код приходит (заново, если уже был отправлен)
        if (rec.purpose === "LOGIN") return sendCodeToChat(rec.id, msg.chatId, owner.locale);
        if (rec.purpose === "LINK") {
          await db.loginCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
          return botSend(msg.chatId, t(owner.locale as Locale, BOT_TEXT.linked, { phone: formatPhone(owner.phone) }), noKeyboard);
        }
      }
      return botSend(msg.chatId, t(msg.lang, BOT_TEXT.askContact), shareKeyboard(msg.lang));
    }
    return botSend(msg.chatId, t(msg.lang, BOT_TEXT.welcome), shareKeyboard(msg.lang));
  }

  if (msg.kind === "other") return botSend(msg.chatId, t(msg.lang, BOT_TEXT.askContact), shareKeyboard(msg.lang));

  // Номер, которым поделились кнопкой
  if (!msg.own || !msg.phone) return botSend(msg.chatId, t(msg.lang, BOT_TEXT.notOwn), shareKeyboard(msg.lang));
  const user = await db.user.findUnique({ where: { phone: msg.phone } });
  if (!user || user.status !== "ACTIVE") {
    return botSend(msg.chatId, t(msg.lang, BOT_TEXT.notRegistered, { phone: formatPhone(msg.phone) }), noKeyboard);
  }
  const lang = (parseLocale(user.locale) ?? msg.lang) as Locale;
  // Один чат — один пользователь: чат, подключённый раньше к другому номеру, переходит к этому
  await db.$transaction([
    db.user.updateMany({ where: { telegramChatId: msg.chatId, NOT: { id: user.id } }, data: { telegramChatId: null } }),
    db.user.update({ where: { id: user.id }, data: { telegramChatId: msg.chatId } }),
  ]);

  const pending = await db.loginCode.findMany({
    where: { chatId: msg.chatId, usedAt: null, expiresAt: { gt: new Date() }, sentAt: null },
    orderBy: { createdAt: "desc" },
  });
  const mismatch = pending.find((p) => p.phone !== user.phone);
  const links = pending.filter((p) => p.purpose === "LINK" && p.phone === user.phone);
  if (links.length) await db.loginCode.updateMany({ where: { id: { in: links.map((p) => p.id) } }, data: { usedAt: new Date() } });
  await botSend(msg.chatId, t(lang, BOT_TEXT.linked, { phone: formatPhone(user.phone) }), noKeyboard);
  const login = pending.find((p) => p.purpose === "LOGIN" && p.phone === user.phone);
  if (login) return sendCodeToChat(login.id, msg.chatId, user.locale);
  if (mismatch) return botSend(msg.chatId, t(lang, BOT_TEXT.mismatch, { phone: formatPhone(user.phone) }));
}

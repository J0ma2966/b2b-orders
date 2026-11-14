import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { handleTelegramUpdate, requestLoginCode, verifyLoginCode, verifyRegisterCode } from "@/lib/login-code";
import { cleanCode, codeMatches, generateCode, hashCode, parseTgUpdate, type TgUpdate } from "@/lib/login-code-core";

// Вход по одноразовому коду: бот Telegram (привязка номера кнопкой «Поделиться номером»),
// Telegram Gateway и SMS (Eskiz). Сеть подменена — запросы к Telegram и Eskiz записываются.

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-5);
let n = 0;
const newPhone = () => `+99895${tag}${String(n++).padStart(2, "0")}`;
const digits = (p: string) => p.replace(/\D/g, "");

type Sent = { url: string; body: Record<string, unknown> };
let sent: Sent[] = [];
const ENV_KEYS = ["TELEGRAM_LOGIN_BOT_TOKEN", "TELEGRAM_LOGIN_BOT_USERNAME", "TELEGRAM_GATEWAY_TOKEN", "ESKIZ_EMAIL", "ESKIZ_PASSWORD"];

function mockNetwork() {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const body = init.body instanceof FormData ? Object.fromEntries(init.body as unknown as Iterable<[string, string]>) : JSON.parse(String(init.body ?? "{}"));
    sent.push({ url, body });
    if (url.includes("eskiz") && url.endsWith("/auth/login")) return Response.json({ data: { token: "eskiz-token" } });
    if (url.includes("eskiz")) return Response.json({ status: "waiting" });
    return Response.json({ ok: true, result: {} });
  });
}
const botMessages = (chatId: string) => sent.filter((s) => s.url.endsWith("/sendMessage") && s.body.chat_id === chatId).map((s) => String(s.body.text));
const codeFrom = (text: string) => /(\d{6})/.exec(text)?.[1] ?? "";

const msg = (chatId: string, extra: object): TgUpdate => ({
  message: { chat: { id: Number(chatId), type: "private" }, from: { id: Number(chatId), language_code: "ru" }, ...extra },
});
const contact = (chatId: string, phone: string, userId = chatId) => msg(chatId, { contact: { phone_number: digits(phone), user_id: Number(userId) } });
const start = (chatId: string, token: string) => msg(chatId, { text: `/start ${token}` });

describe("код входа: чистые функции", () => {
  it("код из 6 цифр, хеш привязан к записи", () => {
    const code = generateCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(codeMatches("a", code, hashCode("a", code))).toBe(true);
    expect(codeMatches("b", code, hashCode("a", code))).toBe(false);
    expect(cleanCode(" 123 456 ")).toBe("123456");
    expect(cleanCode("12345")).toBeNull();
  });

  it("номер для входа принимается только свой, из кнопки «Поделиться номером»", () => {
    const own = parseTgUpdate(contact("100", "+998901112233"));
    expect(own).toMatchObject({ kind: "contact", own: true, phone: "+998901112233" });
    expect(parseTgUpdate(contact("100", "+998901112233", "200"))).toMatchObject({ own: false });
    expect(parseTgUpdate(start("100", "abc_DEF-1"))).toMatchObject({ kind: "start", token: "abc_DEF-1" });
    // Группы и каналы бот не обслуживает
    expect(parseTgUpdate({ message: { chat: { id: 1, type: "group" }, from: { id: 1 }, text: "/start" } })).toBeNull();
    expect(parseTgUpdate({ message: { chat: { id: 1, type: "private" }, from: { id: 1, language_code: "uz" }, text: "salom" } })).toMatchObject({ kind: "other", lang: "uz" });
  });
});

describe.skipIf(!enabled)("вход по коду", () => {
  beforeEach(() => {
    sent = [];
    for (const k of ENV_KEYS) delete process.env[k];
    mockNetwork();
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    await db.$disconnect();
  });

  const user = (extra: object = {}) => db.user.create({ data: { phone: newPhone(), passwordHash: "-", fullName: "Код", ...extra } });

  it("без настроек способ недоступен", async () => {
    const u = await user();
    expect(await requestLoginCode(u.phone, "TELEGRAM", null)).toMatchObject({ ok: false });
    expect(await requestLoginCode(u.phone, "SMS", null)).toMatchObject({ ok: false });
  });

  it("бот: первый раз — ссылка, номер кнопкой, код приходит в чат; дальше — сразу", async () => {
    process.env.TELEGRAM_LOGIN_BOT_TOKEN = "1:test";
    process.env.TELEGRAM_LOGIN_BOT_USERNAME = "b2b_login_bot";
    const u = await user();
    const chat = `7${tag}1`;

    const r = await requestLoginCode(u.phone, "TELEGRAM", "10.0.0.1");
    expect(r.ok).toBe(true);
    const url = r.ok ? r.botUrl! : "";
    expect(url).toMatch(/^https:\/\/t\.me\/b2b_login_bot\?start=/);
    expect(sent).toHaveLength(0); // чат ещё не привязан — отправлять некуда

    await handleTelegramUpdate(start(chat, url.split("start=")[1]));
    expect(botMessages(chat).at(-1)).toContain("Поделиться номером");
    // Ссылку открыли, но чужой номер (пересланный контакт) не принимается
    await handleTelegramUpdate(contact(chat, u.phone, "999"));
    expect(await db.user.findUnique({ where: { id: u.id } })).toMatchObject({ telegramChatId: null });

    await handleTelegramUpdate(contact(chat, u.phone));
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).telegramChatId).toBe(chat);
    const code = codeFrom(botMessages(chat).at(-1)!);
    expect(code).toMatch(/^\d{6}$/);

    expect(await verifyLoginCode(u.phone, code === "000000" ? "111111" : "000000")).toBeNull();
    expect((await verifyLoginCode(u.phone, code))?.id).toBe(u.id);
    // Один код — один вход
    expect(await verifyLoginCode(u.phone, code)).toBeNull();

    // Повторный запрос (после паузы) — код приходит сразу, без ссылки
    await db.loginCode.updateMany({ where: { phone: u.phone }, data: { createdAt: new Date(Date.now() - 2 * 60_000) } });
    sent = [];
    const r2 = await requestLoginCode(u.phone, "TELEGRAM", null);
    const first = codeFrom(botMessages(chat).at(-1)!);
    expect(first).toMatch(/^\d{6}$/);
    // «Старт» по ссылке — сразу новый код, без «Поделиться номером»
    await handleTelegramUpdate(start(chat, r2.ok ? r2.botUrl!.split("start=")[1] : ""));
    const again = codeFrom(botMessages(chat).at(-1)!);
    expect(again).toMatch(/^\d{6}$/);
    expect((await verifyLoginCode(u.phone, again))?.id).toBe(u.id);
  });

  it("бот: номер в Telegram не совпадает с введённым — код не приходит", async () => {
    process.env.TELEGRAM_LOGIN_BOT_TOKEN = "1:test";
    process.env.TELEGRAM_LOGIN_BOT_USERNAME = "b2b_login_bot";
    const [victim, other] = await Promise.all([user(), user()]);
    const chat = `7${tag}2`;
    const r = await requestLoginCode(victim.phone, "TELEGRAM", null);
    await handleTelegramUpdate(start(chat, r.ok ? r.botUrl!.split("start=")[1] : ""));
    // Злоумышленник открыл ссылку для чужого номера и делится своим
    await handleTelegramUpdate(contact(chat, other.phone));
    const texts = botMessages(chat);
    expect(texts.some((t) => /\d{6}/.test(t))).toBe(false);
    expect(texts.at(-1)).toContain("не совпадает");
    expect((await db.user.findUniqueOrThrow({ where: { id: victim.id } })).telegramChatId).toBeNull();
  });

  it("регистрация: код приходит на незарегистрированный номер только владельцу этого номера", async () => {
    process.env.TELEGRAM_LOGIN_BOT_TOKEN = "1:test";
    process.env.TELEGRAM_LOGIN_BOT_USERNAME = "b2b_login_bot";
    const phone = newPhone();
    const other = newPhone();
    const [chat, stranger] = [`7${tag}5`, `7${tag}6`];

    const r = await requestLoginCode(phone, "TELEGRAM", null, "REGISTER");
    expect(r.ok).toBe(true);
    const token = r.ok ? r.botUrl!.split("start=")[1] : "";

    // Чужой человек открыл ссылку и делится своим номером — кода нет
    await handleTelegramUpdate(start(stranger, token));
    await handleTelegramUpdate(contact(stranger, other));
    expect(botMessages(stranger).some((t) => /\d{6}/.test(t))).toBe(false);
    expect(botMessages(stranger).at(-1)).toContain("не совпадает");

    // Владелец номера: «Старт», «Поделиться номером» — код в чате
    await handleTelegramUpdate(start(chat, token));
    expect(botMessages(chat).at(-1)).toContain("Поделиться номером");
    await handleTelegramUpdate(contact(chat, phone));
    const text = botMessages(chat).at(-1)!;
    expect(text).toContain("Код для регистрации");
    const code = codeFrom(text);

    // Код регистрации не годится для входа, и наоборот — неверный код не подтверждает номер
    expect(await verifyLoginCode(phone, code)).toBeNull();
    expect(await verifyRegisterCode(phone, code === "000000" ? "111111" : "000000")).toBeNull();
    expect(await verifyRegisterCode(phone, code)).toEqual({ chatId: chat });
    expect(await verifyRegisterCode(phone, code)).toBeNull(); // один код — одна регистрация
  });

  it("регистрация: на уже зарегистрированный номер код не выдаётся; без ссылки бот отвечает «не зарегистрирован»", async () => {
    process.env.TELEGRAM_LOGIN_BOT_TOKEN = "1:test";
    process.env.TELEGRAM_LOGIN_BOT_USERNAME = "b2b_login_bot";
    const u = await user();
    expect(await requestLoginCode(u.phone, "TELEGRAM", null, "REGISTER")).toMatchObject({ ok: false });
    const chat = `7${tag}7`;
    await handleTelegramUpdate(contact(chat, newPhone()));
    expect(botMessages(chat).at(-1)).toContain("не зарегистрирован");
  });

  it("незарегистрированный номер: тот же ответ, код не отправляется", async () => {
    process.env.ESKIZ_EMAIL = "a@b.uz";
    process.env.ESKIZ_PASSWORD = "x";
    const r = await requestLoginCode(newPhone(), "SMS", null);
    expect(r).toEqual({ ok: true, botUrl: null });
    expect(sent).toHaveLength(0);
  });

  it("SMS через Eskiz и ограничения на частоту", async () => {
    process.env.ESKIZ_EMAIL = "a@b.uz";
    process.env.ESKIZ_PASSWORD = "x";
    const u = await user();
    expect((await requestLoginCode(u.phone, "SMS", "10.0.0.2")).ok).toBe(true);
    const sms = sent.find((s) => s.url.endsWith("/message/sms/send"))!;
    expect(sms.body.mobile_phone).toBe(digits(u.phone));
    const code = codeFrom(String(sms.body.message));

    // Повтор раньше чем через минуту — отказ с таймером
    const fast = await requestLoginCode(u.phone, "SMS", "10.0.0.2");
    expect(fast).toMatchObject({ ok: false });
    expect(fast.ok ? 0 : fast.retryInSec).toBeGreaterThan(0);

    // Неверный код 5 раз — код сгорает
    for (let i = 0; i < 5; i++) expect(await verifyLoginCode(u.phone, code === "000000" ? "111111" : "000000")).toBeNull();
    expect(await verifyLoginCode(u.phone, code)).toBeNull();
  });

  it("Telegram Gateway: код на номер без бота", async () => {
    process.env.TELEGRAM_GATEWAY_TOKEN = "gw";
    process.env.TELEGRAM_LOGIN_BOT_TOKEN = "1:test"; // Gateway важнее бота
    const u = await user();
    const r = await requestLoginCode(u.phone, "TELEGRAM", null);
    expect(r).toEqual({ ok: true, botUrl: null });
    const call = sent.find((s) => s.url.includes("gatewayapi.telegram.org"))!;
    expect(call.body.phone_number).toBe(u.phone);
    expect((await verifyLoginCode(u.phone, String(call.body.code)))?.id).toBe(u.id);
  });

  it("заблокированный пользователь по коду не входит", async () => {
    process.env.ESKIZ_EMAIL = "a@b.uz";
    process.env.ESKIZ_PASSWORD = "x";
    const u = await user({ status: "BLOCKED" });
    await requestLoginCode(u.phone, "SMS", null);
    expect(sent).toHaveLength(0);
  });

  it("первый вход по коду в учётную запись, заведённую другим, закрывает чужие сессии и сбрасывает пароль", async () => {
    const u = await user({ passwordHash: "known-to-adder" });
    await db.session.createMany({ data: [{ userId: u.id, tokenHash: `a${tag}${n}`, expiresAt: new Date(Date.now() + 3600_000) }, { userId: u.id, tokenHash: `b${tag}${n}`, expiresAt: new Date(Date.now() + 3600_000) }] });
    const issue = async (target: { phone: string }) => {
      const rec = await db.loginCode.create({ data: { phone: target.phone, purpose: "LOGIN", channel: "SMS", expiresAt: new Date(Date.now() + 300_000), sentAt: new Date() } });
      await db.loginCode.update({ where: { id: rec.id }, data: { codeHash: hashCode(rec.id, "123456") } });
    };
    await issue(u);
    const claimed = await verifyLoginCode(u.phone, "123456");
    expect(claimed?.id).toBe(u.id);
    expect(claimed?.phoneVerifiedAt).toBeInstanceOf(Date);
    expect(claimed?.mustChangePassword).toBe(true);
    expect(claimed?.passwordHash).not.toBe("known-to-adder");
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);

    // Подтверждённый номер: другие устройства остаются в системе
    await db.session.create({ data: { userId: u.id, tokenHash: `c${tag}${n}`, expiresAt: new Date(Date.now() + 3600_000) } });
    await issue(u);
    const again = await verifyLoginCode(u.phone, "123456");
    expect(again?.passwordHash).toBe(claimed?.passwordHash);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(1);
  });

  it("пересланная ссылка регистрации не перепривязывает чат, в который уже ушёл код", async () => {
    process.env.TELEGRAM_LOGIN_BOT_TOKEN = "1:test";
    const phone = newPhone();
    const rec = await db.loginCode.create({ data: { phone, purpose: "REGISTER", channel: "TELEGRAM", linkToken: `tok${tag}${n}`, chatId: `7${tag}5`, sentAt: new Date(), expiresAt: new Date(Date.now() + 600_000) } });
    await handleTelegramUpdate(start(`7${tag}6`, rec.linkToken!));
    expect((await db.loginCode.findUniqueOrThrow({ where: { id: rec.id } })).chatId).toBe(`7${tag}5`);
    expect(botMessages(`7${tag}6`).at(-1)).toBeTruthy();
  });
});

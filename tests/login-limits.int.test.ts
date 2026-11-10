import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { MAX_FAILS_PER_PHONE, finishLoginAttempt, reserveLoginAttempt } from "@/lib/auth/login-attempts";
import { requestLoginCode, verifyLoginCode } from "@/lib/login-code";
import { MAX_ATTEMPTS_PER_CODE, hashCode } from "@/lib/login-code-core";
import { guardedLookup } from "@/lib/ssrf-resolve";
import { secretMatches } from "@/lib/secret-compare";

// Повторный аудит 2026-11-10: лимиты входа обходились залпом одновременных запросов —
// все успевали прочитать счётчик раньше, чем он вырастет.

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-5);
let n = 0;
const newPhone = () => `+99894${tag}${String(n++).padStart(2, "0")}`;

describe.skipIf(!enabled)("лимиты входа при одновременных запросах", () => {
  afterAll(async () => {
    await db.loginCode.deleteMany({ where: { phone: { startsWith: `+99894${tag}` } } });
    await db.loginAttempt.deleteMany({ where: { phone: { startsWith: `+99894${tag}` } } });
    await db.user.deleteMany({ where: { phone: { startsWith: `+99894${tag}` } } });
    await db.$disconnect();
  });

  it("залп из 200 вариантов кода: проверяются не больше 5, верный код среди остальных не срабатывает", async () => {
    const phone = newPhone();
    await db.user.create({ data: { phone, fullName: "Проверка", passwordHash: "x" } });
    const rec = await db.loginCode.create({ data: { phone, channel: "SMS", expiresAt: new Date(Date.now() + 300_000) } });
    await db.loginCode.update({ where: { id: rec.id }, data: { codeHash: hashCode(rec.id, "654321") } });
    const guesses = Array.from({ length: 200 }, (_, i) => String(i).padStart(6, "0"));
    const res = await Promise.all(guesses.map((g) => verifyLoginCode(phone, g)));
    expect(res.filter(Boolean)).toHaveLength(0);
    const after = await db.loginCode.findUniqueOrThrow({ where: { id: rec.id } });
    expect(after.attempts).toBe(MAX_ATTEMPTS_PER_CODE);
    // Попытки исчерпаны — теперь не подходит и верный код
    expect(await verifyLoginCode(phone, "654321")).toBeNull();
  });

  it("верный код с первой попытки по-прежнему входит, и только один раз", async () => {
    const phone = newPhone();
    await db.user.create({ data: { phone, fullName: "Проверка", passwordHash: "x" } });
    const rec = await db.loginCode.create({ data: { phone, channel: "SMS", expiresAt: new Date(Date.now() + 300_000) } });
    await db.loginCode.update({ where: { id: rec.id }, data: { codeHash: hashCode(rec.id, "111222") } });
    const res = await Promise.all([verifyLoginCode(phone, "111222"), verifyLoginCode(phone, "111222"), verifyLoginCode(phone, "111222")]);
    expect(res.filter(Boolean)).toHaveLength(1);
  });

  it("залп из 60 попыток входа: дальше лимита проходят не больше 5", async () => {
    const phone = newPhone();
    const ids = await Promise.all(Array.from({ length: 60 }, () => reserveLoginAttempt(phone, null)));
    expect(ids.filter(Boolean)).toHaveLength(MAX_FAILS_PER_PHONE);
    // Отказы по лимиту блокировку не продлевают: в журнале только прошедшие попытки
    expect(await db.loginAttempt.count({ where: { phone } })).toBe(MAX_FAILS_PER_PHONE);
    expect(await reserveLoginAttempt(phone, null)).toBeNull();
  });

  it("удачный вход неудачей не считается", async () => {
    const phone = newPhone();
    for (let i = 0; i < 8; i++) {
      const id = await reserveLoginAttempt(phone, null);
      expect(id).not.toBeNull();
      await finishLoginAttempt(id!, true);
    }
    expect(await db.loginAttempt.count({ where: { phone, success: false } })).toBe(0);
  });

  it("залп запросов кода на один номер: уходит одно SMS", async () => {
    const keep = { email: process.env.ESKIZ_EMAIL, password: process.env.ESKIZ_PASSWORD };
    process.env.ESKIZ_EMAIL = "a@b.uz";
    process.env.ESKIZ_PASSWORD = "p";
    let sms = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (String(url).endsWith("/auth/login")) return Response.json({ data: { token: "t" } });
      sms++;
      return Response.json({ status: "waiting" });
    });
    try {
      const phone = newPhone();
      await db.user.create({ data: { phone, fullName: "Проверка", passwordHash: "x" } });
      const res = await Promise.all(Array.from({ length: 30 }, () => requestLoginCode(phone, "SMS", "203.0.113.50")));
      expect(res.filter((r) => r.ok)).toHaveLength(1);
      expect(sms).toBe(1);
      expect(await db.loginCode.count({ where: { phone } })).toBe(1);
    } finally {
      vi.unstubAllGlobals();
      process.env.ESKIZ_EMAIL = keep.email;
      process.env.ESKIZ_PASSWORD = keep.password;
      if (keep.email === undefined) delete process.env.ESKIZ_EMAIL;
      if (keep.password === undefined) delete process.env.ESKIZ_PASSWORD;
    }
  });
});

describe("push: адрес проверяется в момент соединения", () => {
  const resolve = (host: string) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown }>((done) => guardedLookup(host, { all: true }, (err, address) => done({ err, address })));

  it("имя, которое ведёт на 127.0.0.1, не резолвится", async () => {
    const r = await resolve("localhost");
    expect(r.err?.code).toBe("ESSRFBLOCKED");
  });
});

describe("секрет из заголовка", () => {
  it("сравнение не падает на не-ASCII и разной длине", () => {
    expect(secretMatches("abc", "abc")).toBe(true);
    expect(secretMatches("abd", "abc")).toBe(false);
    expect(secretMatches("ключ", "abcd")).toBe(false);
    expect(secretMatches("", "abc")).toBe(false);
    expect(secretMatches("", "")).toBe(false);
    expect(secretMatches("x", undefined)).toBe(false);
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { db } from "@/lib/db";
import { POST } from "@/app/api/support-mail/inbound/route";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = String(Date.now()).slice(-8);
let adminId = "";

const call = (body: unknown, secret = "s3cret") =>
  POST(new Request("http://x/api/support-mail/inbound", { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify(body) }));

const msg = (n: string) => ({ id: `${tag}-${n}`, messageId: `<${tag}-${n}@gmail.com>`, from: `Магазин <shop${n}@gmail.com>`, subject: `Вопрос ${n}`, text: `Текст ${n}`, date: new Date().toISOString() });

describe.skipIf(!enabled)("почта поддержки через скрипт Gmail", () => {
  beforeAll(async () => {
    vi.stubEnv("SUPPORT_MAIL_WEBHOOK_SECRET", "s3cret");
    adminId = (await db.user.create({ data: { phone: `+99891${tag.slice(-7)}`, passwordHash: "-", fullName: "Админ", isSuperAdmin: true } })).id;
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await db.user.delete({ where: { id: adminId } });
  });

  it("без секрета или с чужим — 403, кривые данные — 400", async () => {
    expect((await call({ messages: [] }, "wrong")).status).toBe(403);
    vi.stubEnv("SUPPORT_MAIL_WEBHOOK_SECRET", "");
    expect((await call({ messages: [] }, "")).status).toBe(403);
    vi.stubEnv("SUPPORT_MAIL_WEBHOOK_SECRET", "s3cret");
    expect((await call({ messages: [{ subject: "без id" }] })).status).toBe(400);
  });

  it("первая отправка — одно общее уведомление, дальше по письму, повтор не дублирует", async () => {
    const r1 = await call({ initial: true, messages: [msg("1"), msg("2")] });
    expect(await r1.json()).toEqual({ ok: true, created: 2 });
    let notes = await db.notification.findMany({ where: { userId: adminId }, orderBy: { createdAt: "asc" } });
    expect(notes.map((n) => n.type)).toEqual(["support.connected"]);

    const r2 = await call({ messages: [msg("2"), msg("3")] });
    expect(await r2.json()).toEqual({ ok: true, created: 1 });
    notes = await db.notification.findMany({ where: { userId: adminId, type: "support.email" } });
    const row = await db.supportEmail.findUniqueOrThrow({ where: { messageKey: `<${tag}-3@gmail.com>` } });
    expect(notes.map((n) => [n.title, n.link])).toEqual([["Письмо в поддержку: Вопрос 3", `/admin/support/${row.id}`]]);
    expect(row.fromName).toBe("Магазин");
    expect(row.fromAddress).toBe(`shop3@gmail.com`);
  });

  it("письма из спама Gmail: пометка, одно общее уведомление, не в счётчике новых", async () => {
    const spam = (n: string) => ({ ...msg(n), spam: true });
    const r = await call({ messages: [spam("s1"), spam("s2"), msg("4")] });
    expect(await r.json()).toEqual({ ok: true, created: 3 });
    const rows = await db.supportEmail.findMany({ where: { messageKey: { in: [`<${tag}-s1@gmail.com>`, `<${tag}-4@gmail.com>`] } }, orderBy: { messageKey: "asc" } });
    expect(rows.map((x) => [x.messageKey.includes("-4@"), x.spam])).toEqual([[true, false], [false, true]]);
    const spamNotes = await db.notification.findMany({ where: { userId: adminId, type: "support.spam" } });
    expect(spamNotes.map((n) => [n.title, n.link])).toEqual([["В спаме Gmail писем: 2", "/admin/support?status=spam"]]);
    const mailNotes = await db.notification.findMany({ where: { userId: adminId, type: "support.email" } });
    expect(mailNotes.map((n) => n.title)).toContain("Письмо в поддержку: Вопрос 4");
    expect(mailNotes.map((n) => n.title)).not.toContain("Письмо в поддержку: Вопрос s1");
  });
});

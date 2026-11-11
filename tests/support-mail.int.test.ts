import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current", () => ({ getAuth: async () => null }));

import { ImapFlow } from "imapflow";
import { db } from "@/lib/db";
import { SUPPORT_MAIL_STATE_KEY, pollSupportMail } from "@/lib/support-mail";

// Нужен тестовый IMAP-сервер (например, Dovecot на 127.0.0.1:1143 без TLS) и база:
// SUPPORT_IMAP_TEST_HOST, SUPPORT_IMAP_TEST_PORT, SUPPORT_IMAP_TEST_USER, SUPPORT_IMAP_TEST_PASSWORD
const host = process.env.SUPPORT_IMAP_TEST_HOST;
const enabled = !!process.env.TEST_DATABASE_URL && !!host;
const tag = String(Date.now()).slice(-8);
const port = Number(process.env.SUPPORT_IMAP_TEST_PORT || 1143);
const user = process.env.SUPPORT_IMAP_TEST_USER ?? "";
const pass = process.env.SUPPORT_IMAP_TEST_PASSWORD ?? "";
let adminId = "";

async function imap<T>(fn: (c: ImapFlow) => Promise<T>) {
  const c = new ImapFlow({ host: host!, port, secure: false, auth: { user, pass }, logger: false });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.logout();
  }
}

const mail = (n: string, extra = "") =>
  [
    `From: =?UTF-8?B?${Buffer.from("Магазин Алмаз").toString("base64")}?= <shop${n}@example.uz>`,
    `To: ${user}`,
    `Subject: =?UTF-8?B?${Buffer.from(`Не приходит заказ ${n}`).toString("base64")}?=`,
    `Message-ID: <${tag}-${n}@example.uz>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    extra,
    "",
    `Здравствуйте! Заказ ${n} не пришёл.`,
  ].join("\r\n");

describe.skipIf(!enabled)("почта техподдержки через IMAP", () => {
  beforeAll(async () => {
    vi.stubEnv("SUPPORT_IMAP_HOST", host!);
    vi.stubEnv("SUPPORT_IMAP_PORT", String(port));
    vi.stubEnv("SUPPORT_IMAP_SECURE", "0");
    vi.stubEnv("SUPPORT_IMAP_USER", user);
    vi.stubEnv("SUPPORT_IMAP_PASSWORD", pass);
    await db.platformSetting.deleteMany({ where: { key: SUPPORT_MAIL_STATE_KEY } });
    await db.supportEmail.deleteMany({});
    adminId = (await db.user.create({ data: { phone: `+99890${tag.slice(-7)}`, passwordHash: "-", fullName: "Админ", isSuperAdmin: true } })).id;
    await imap(async (c) => {
      // Чистый ящик на каждый запуск
      await c.mailboxOpen("INBOX");
      await c.messageDelete("1:*");
      await c.append("INBOX", mail("old"), [], new Date(Date.now() - 30 * 86_400_000));
      await c.append("INBOX", mail("1"));
    });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await db.user.delete({ where: { id: adminId } });
  });

  it("первое подключение: письма за 7 дней без уведомления о каждом, ящик не меняется", async () => {
    expect(await pollSupportMail()).toEqual({ created: 1 });
    const rows = await db.supportEmail.findMany();
    expect(rows.map((r) => r.subject)).toEqual(["Не приходит заказ 1"]);
    expect(rows[0].fromName).toBe("Магазин Алмаз");
    expect(rows[0].fromAddress).toBe("shop1@example.uz");
    const notes = await db.notification.findMany({ where: { userId: adminId } });
    expect(notes.map((n) => n.type)).toEqual(["support.connected"]);
    // Письма остались непрочитанными
    const unseen = await imap(async (c) => {
      await c.mailboxOpen("INBOX", { readOnly: true });
      return (await c.search({ seen: false }, { uid: true })) || [];
    });
    expect(unseen).toHaveLength(2);
  });

  it("новое письмо: запись и уведомление со ссылкой; повтор ничего не дублирует", async () => {
    await imap((c) => c.append("INBOX", mail("2")));
    expect(await pollSupportMail()).toEqual({ created: 1 });
    expect(await pollSupportMail()).toEqual({ created: 0 });
    const row = await db.supportEmail.findFirstOrThrow({ where: { subject: "Не приходит заказ 2" } });
    expect(row.text).toContain("Заказ 2 не пришёл");
    const n = await db.notification.findFirstOrThrow({ where: { userId: adminId, type: "support.email" } });
    expect(n.title).toBe("Письмо в поддержку: Не приходит заказ 2");
    expect(n.body).toBe("Магазин Алмаз <shop2@example.uz>: Здравствуйте! Заказ 2 не пришёл.");
    expect(n.link).toBe(`/admin/support/${row.id}`);
  });

  it("неверный пароль: понятная ошибка в состоянии, без падения", async () => {
    vi.stubEnv("SUPPORT_IMAP_PASSWORD", "wrong");
    const r = await pollSupportMail();
    vi.stubEnv("SUPPORT_IMAP_PASSWORD", pass);
    expect(r && "error" in r && r.error).toMatch(/логин или пароль/);
    const s = await db.platformSetting.findUniqueOrThrow({ where: { key: SUPPORT_MAIL_STATE_KEY } });
    expect((s.value as { lastError: string }).lastError).toMatch(/логин или пароль/);
    expect(await pollSupportMail()).toEqual({ created: 0 });
  }, 30_000);
});

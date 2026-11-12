import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let adminId = "";
vi.mock("@/lib/auth/current", () => ({ requireSuperAdmin: async () => ({ user: { id: adminId } }), getAuth: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { db } from "@/lib/db";
import { ingestSupportMails } from "@/lib/support-mail";
import { markAllSupportEmailsHandledAction } from "@/app/admin/support/actions";

const enabled = !!process.env.TEST_DATABASE_URL;
const tag = `bulk${String(Date.now()).slice(-8)}`;
const mail = (n: string, subject: string) => ({ uid: 0, uidValidity: tag, messageId: `<${tag}-${n}@x>`, subject: `${subject} ${tag}`, text: "x", from: { address: "a@b.uz" } });
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const handled = async () =>
  Object.fromEntries((await db.supportEmail.findMany({ where: { messageKey: { contains: tag } } })).map((r) => [r.messageKey.slice(tag.length + 2, -3), !!r.handledAt]));

describe.skipIf(!enabled)("почта поддержки: темы и «отметить все»", () => {
  beforeAll(async () => {
    adminId = (await db.user.create({ data: { phone: `+99892${tag.slice(-7)}`, passwordHash: "-", fullName: "Админ", isSuperAdmin: true } })).id;
    await ingestSupportMails([mail("1", "[OptoLink: Удаление аккаунта]"), mail("2", "Re: [OptoLink: Удаление аккаунта]"), mail("3", "Вопрос")], { silent: true });
  });
  afterAll(async () => {
    await db.supportEmail.deleteMany({ where: { messageKey: { contains: tag } } });
    await db.notification.deleteMany({ where: { userId: adminId } });
    await db.user.delete({ where: { id: adminId } });
  });

  it("тема сохраняется при приёме письма", async () => {
    const rows = await db.supportEmail.findMany({ where: { messageKey: { contains: tag } }, orderBy: { messageKey: "asc" } });
    expect(rows.map((r) => r.topic)).toEqual(["deletion", "deletion", null]);
  });

  it("спам Gmail виден только в своём фильтре", async () => {
    await ingestSupportMails([{ ...mail("9", "Выигрыш"), spam: true }]);
    const { supportWhere } = await import("@/app/admin/support/filter");
    const keys = async (status?: string) => (await db.supportEmail.findMany({ where: { AND: [supportWhere({ q: tag, status }), { messageKey: { contains: tag } }] } })).map((r) => r.messageKey.slice(tag.length + 2, -3)).sort();
    expect(await keys()).toEqual(["1", "2", "3"]);
    expect(await keys("new")).toEqual(["1", "2", "3"]);
    expect(await keys("spam")).toEqual(["9"]);
  });

  it("«отметить все» трогает только письма по фильтру, потом — все остальные", async () => {
    await markAllSupportEmailsHandledAction(form({ q: tag, topic: "deletion" }));
    expect(await handled()).toEqual({ "1": true, "2": true, "3": false, "9": false });
    await markAllSupportEmailsHandledAction(form({ q: tag }));
    // Спам не трогается, пока не выбран фильтр «Спам Gmail»
    expect(await handled()).toEqual({ "1": true, "2": true, "3": true, "9": false });
    const row = await db.supportEmail.findFirstOrThrow({ where: { messageKey: { contains: tag }, spam: false } });
    expect(row.handledById).toBe(adminId);
  });
});

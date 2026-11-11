import { describe, expect, it } from "vitest";
import { describeImapError, htmlToText, replyMailto, senderLabel, supportMailConfig, toRecord, uidsToFetch } from "@/lib/support-mail-core";

describe("почта техподдержки: чистые функции", () => {
  it("настройки: без хоста, логина или пароля — выключено; 993 — TLS", () => {
    expect(supportMailConfig({})).toBeNull();
    expect(supportMailConfig({ SUPPORT_IMAP_HOST: "imap.yandex.ru", SUPPORT_IMAP_USER: "s@x.uz" })).toBeNull();
    const c = supportMailConfig({ SUPPORT_IMAP_HOST: " imap.yandex.ru ", SUPPORT_IMAP_USER: "s@x.uz", SUPPORT_IMAP_PASSWORD: "p" });
    expect(c).toEqual({ host: "imap.yandex.ru", port: 993, secure: true, user: "s@x.uz", password: "p", mailbox: "INBOX" });
    expect(supportMailConfig({ SUPPORT_IMAP_HOST: "h", SUPPORT_IMAP_USER: "u", SUPPORT_IMAP_PASSWORD: "p", SUPPORT_IMAP_PORT: "143" })?.secure).toBe(false);
    const fromFile = supportMailConfig({ SUPPORT_IMAP_HOST: "h", SUPPORT_IMAP_USER: "u", SUPPORT_IMAP_PASSWORD_FILE: "/x" }, (p) => (p === "/x" ? 'a$b"c' : ""));
    expect(fromFile?.password).toBe('a$b"c');
    expect(supportMailConfig({ SUPPORT_IMAP_HOST: "h", SUPPORT_IMAP_USER: "u", SUPPORT_IMAP_PASSWORD_FILE: "/missing" }, () => "")).toBeNull();
  });

  it("какие письма забирать", () => {
    expect(uidsToFetch([5, 1, 9, 3], null, 2)).toEqual([5, 9]);
    expect(uidsToFetch([5, 1, 9, 3, 9], 3)).toEqual([5, 9]);
    expect(uidsToFetch([3], 3)).toEqual([]); // «N:*» в IMAP всегда возвращает последнее письмо
    expect(uidsToFetch([4, 5, 6, 7], 3, 20, 2)).toEqual([4, 5]);
  });

  it("письмо → запись: текст из HTML, чистые адреса, ключ без Message-ID", () => {
    const now = new Date("2026-11-11T10:00:00Z");
    const r = toRecord(
      {
        uid: 7,
        uidValidity: "42",
        from: { address: "Shop@Mail.UZ", name: "Магазин" },
        replyTo: { address: "not an address" },
        subject: "  ",
        html: "<p>Здравствуйте&nbsp;!</p><script>alert(1)</script><div>Не&nbsp;работает &lt;вход&gt;</div>",
        date: new Date("2030-01-01T00:00:00Z"),
        attachments: [{ filename: "скрин.png", size: 2048, contentType: "image/png" }],
      },
      now,
    );
    expect(r.messageKey).toBe("42:7");
    expect(r.fromAddress).toBe("shop@mail.uz");
    expect(r.replyTo).toBeNull();
    expect(r.subject).toBe("(без темы)");
    expect(r.text).toBe("Здравствуйте !\nНе работает <вход>");
    expect(r.receivedAt).toEqual(now); // дата из будущего не принимается
    expect(r.attachments).toEqual([{ name: "скрин.png", size: 2048, type: "image/png" }]);
    expect(toRecord({ uid: 1, uidValidity: "1", messageId: "<a@b>", text: "x".repeat(30_000) }).text).toHaveLength(20_000);
  });

  it("ответ письмом и подпись отправителя", () => {
    expect(replyMailto({ replyTo: null, fromAddress: "a@b.uz", subject: "Вопрос & заказ" })).toBe("mailto:a@b.uz?subject=Re%3A%20%D0%92%D0%BE%D0%BF%D1%80%D0%BE%D1%81%20%26%20%D0%B7%D0%B0%D0%BA%D0%B0%D0%B7");
    expect(replyMailto({ replyTo: "r@b.uz", fromAddress: "a@b.uz", subject: "RE: x" })).toBe("mailto:r@b.uz?subject=RE%3A%20x");
    expect(replyMailto({ replyTo: null, fromAddress: null, subject: "x" })).toBeNull();
    expect(senderLabel({ fromName: "Али", fromAddress: "a@b.uz" })).toBe("Али <a@b.uz>");
  });

  it("ошибки IMAP понятным языком", () => {
    expect(describeImapError({ authenticationFailed: true })).toMatch(/пароль приложения/);
    expect(describeImapError({ code: "ENOTFOUND" })).toMatch(/Не найден/);
    expect(htmlToText("a<br>b")).toBe("a\nb");
  });
});

import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { db } from "@/lib/db";
import { notifySuperAdmins } from "@/lib/notify";
import {
  FIRST_RUN_DAYS,
  MAX_SOURCE_BYTES,
  NOTIFY_EACH,
  describeImapError,
  senderLabel,
  snippet,
  supportMailConfig,
  toRecord,
  uidsToFetch,
  webhookToIncoming,
  type IncomingMail,
  type WebhookMail,
  type ParsedAddress,
  type SupportMailConfig,
} from "@/lib/support-mail-core";

// Почта техподдержки: сервер раз в минуту заходит в ящик по IMAP, сохраняет новые письма
// и шлёт суперадминам уведомление (колокольчик, push). Ящик открывается только для чтения:
// письма не помечаются прочитанными и не удаляются.

export const SUPPORT_MAIL_STATE_KEY = "supportMail";

export type SupportMailState = {
  uidValidity?: string;
  lastUid?: number;
  lastCheckAt?: string;
  lastOkAt?: string;
  lastError?: string | null;
};

export async function supportMailState(): Promise<SupportMailState> {
  const s = await db.platformSetting.findUnique({ where: { key: SUPPORT_MAIL_STATE_KEY } });
  return (s?.value ?? {}) as SupportMailState;
}

async function saveState(state: SupportMailState) {
  await db.platformSetting.upsert({
    where: { key: SUPPORT_MAIL_STATE_KEY },
    create: { key: SUPPORT_MAIL_STATE_KEY, value: state },
    update: { value: state },
  });
}

const firstAddress = (a: AddressObject | AddressObject[] | undefined): ParsedAddress | null => {
  const list = Array.isArray(a) ? a : a ? [a] : [];
  const v = list.flatMap((x) => x.value)[0];
  return v ? { address: v.address, name: v.name } : null;
};

// Сохраняет письма и уведомляет суперадминов. silent — первое подключение: одно общее уведомление.
export async function ingestSupportMails(mails: IncomingMail[], { silent = false, now = new Date() } = {}) {
  const created: { id: string; subject: string; fromName: string | null; fromAddress: string | null; text: string; spam: boolean }[] = [];
  for (const m of mails) {
    const r = toRecord(m, now);
    const exists = await db.supportEmail.findUnique({ where: { messageKey: r.messageKey }, select: { id: true } });
    if (exists) continue;
    try {
      const row = await db.supportEmail.create({ data: { ...r, attachments: r.attachments ?? undefined } });
      created.push(row);
    } catch (e) {
      // Письмо уже сохранено параллельной проверкой
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  if (created.length === 0) return 0;
  if (silent) {
    await notifySuperAdmins({
      type: "support.connected",
      title: "Почта поддержки подключена",
      body: `Загружено писем за последние ${FIRST_RUN_DAYS} дней: ${created.length}`,
      link: "/admin/support",
    });
    return created.length;
  }
  // Письма из «Спама» Gmail: одно общее уведомление, чтобы настоящий спам не засыпал колокольчик
  const spam = created.filter((r) => r.spam);
  if (spam.length > 0) {
    await notifySuperAdmins({
      type: "support.spam",
      title: `В спаме Gmail писем: ${spam.length}`,
      body: spam.length === 1 ? `${senderLabel(spam[0])}: ${snippet(spam[0].subject, 120)}` : "Проверьте, нет ли среди них обращений клиентов",
      link: "/admin/support?status=spam",
    });
  }
  const normal = created.filter((r) => !r.spam);
  for (const r of normal.slice(0, NOTIFY_EACH)) {
    await notifySuperAdmins({
      type: "support.email",
      title: `Письмо в поддержку: ${snippet(r.subject, 120)}`,
      body: `${senderLabel(r)}: ${snippet(r.text)}`,
      link: `/admin/support/${r.id}`,
      entity: "SupportEmail",
      entityId: r.id,
    });
  }
  const rest = normal.length - NOTIFY_EACH;
  if (rest > 0) {
    await notifySuperAdmins({ type: "support.email", title: `Ещё писем в поддержку: ${rest}`, link: "/admin/support" });
  }
  return created.length;
}

async function fetchNew(cfg: SupportMailConfig, state: SupportMailState, now: Date) {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
  // Обрыв соединения после ответа не должен ронять процесс сервера
  client.on("error", (e) => console.error("[support-mail]", describeImapError(e)));
  try {
    await client.connect();
  } catch (e) {
    client.close();
    throw e;
  }
  try {
    const mb = await client.mailboxOpen(cfg.mailbox, { readOnly: true });
    const uidValidity = String(mb.uidValidity);
    const known = state.uidValidity === uidValidity && typeof state.lastUid === "number" ? state.lastUid : null;
    const found =
      known === null
        ? await client.search({ since: new Date(now.getTime() - FIRST_RUN_DAYS * 86_400_000) }, { uid: true })
        : await client.search({ uid: `${known + 1}:*` }, { uid: true });
    const uids = uidsToFetch(found || [], known);
    const mails: IncomingMail[] = [];
    for (const uid of uids) {
      const meta = await client.fetchOne(String(uid), { uid: true, size: true, envelope: true }, { uid: true });
      if (!meta) continue;
      const env = meta.envelope;
      const base: IncomingMail = {
        uid,
        uidValidity,
        messageId: env?.messageId,
        from: env?.from?.[0] ?? null,
        replyTo: env?.replyTo?.[0] ?? null,
        subject: env?.subject,
        date: env?.date ? new Date(env.date) : null,
      };
      if ((meta.size ?? 0) > MAX_SOURCE_BYTES) {
        mails.push({ ...base, tooLarge: true });
        continue;
      }
      try {
        const full = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
        if (!full || !full.source) throw new Error("empty source");
        const p = await simpleParser(full.source, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true });
        mails.push({
          ...base,
          messageId: p.messageId ?? base.messageId,
          from: firstAddress(p.from) ?? base.from,
          replyTo: firstAddress(p.replyTo) ?? base.replyTo,
          subject: p.subject ?? base.subject,
          text: p.text,
          html: typeof p.html === "string" ? p.html : null,
          date: p.date ?? base.date,
          attachments: p.attachments.map((a) => ({ filename: a.filename, size: a.size, contentType: a.contentType })),
        });
      } catch (e) {
        console.error("[support-mail] message uid", uid, e);
        mails.push({ ...base, text: "Не удалось разобрать письмо. Откройте его в почте." });
      }
    }
    const top = Math.max(known ?? 0, known === null ? mb.uidNext - 1 : 0, ...uids);
    return { mails, firstRun: known === null, uidValidity, lastUid: top };
  } finally {
    await client.logout().catch(() => client.close());
  }
}

let running: Promise<unknown> | null = null;

// Одна проверка ящика. Возвращает число новых писем или null, если почта не настроена.
export async function pollSupportMail(now = new Date()): Promise<{ created: number } | { error: string } | null> {
  const cfg = supportMailConfig();
  if (!cfg) return null;
  if (running) {
    await running.catch(() => {});
    return { created: 0 };
  }
  const job = (async () => {
    const state = await supportMailState();
    try {
      const { mails, firstRun, uidValidity, lastUid } = await fetchNew(cfg, state, now);
      const created = await ingestSupportMails(mails, { silent: firstRun, now });
      await saveState({ uidValidity, lastUid, lastCheckAt: now.toISOString(), lastOkAt: now.toISOString(), lastError: null });
      return { created };
    } catch (e) {
      const error = describeImapError(e);
      console.error("[support-mail]", error, e instanceof Error ? e.message : e);
      await saveState({ ...state, lastCheckAt: now.toISOString(), lastError: error });
      return { error };
    }
  })();
  running = job;
  try {
    return await job;
  } finally {
    running = null;
  }
}

// Приём писем от скрипта Google (POST /api/support-mail/inbound). initial — первая отправка скрипта:
// одно общее уведомление вместо уведомления на каждое письмо.
export async function ingestWebhookMails(mails: WebhookMail[], initial: boolean, now = new Date()) {
  const created = await ingestSupportMails(mails.map(webhookToIncoming), { silent: initial, now });
  const state = await supportMailState();
  await saveState({ ...state, lastCheckAt: now.toISOString(), lastOkAt: now.toISOString(), lastError: null });
  return created;
}

// Как подключена почта: IMAP (сервер сам читает ящик), скрипт Google (письма приходят на сайт) или никак
export function supportMailMode(): "imap" | "webhook" | null {
  if (supportMailConfig()) return "imap";
  if (process.env.SUPPORT_MAIL_WEBHOOK_SECRET) return "webhook";
  return null;
}

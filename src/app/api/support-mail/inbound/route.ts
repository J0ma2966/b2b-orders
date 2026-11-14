import { z } from "zod";
import { secretMatches } from "@/lib/secret-compare";
import { ingestWebhookMails } from "@/lib/support-mail";

// Письма в поддержку от скрипта Google в Gmail (deploy/gmail-apps-script.gs).
// Скрипт шлёт секрет SUPPORT_MAIL_WEBHOOK_SECRET в заголовке Authorization: Bearer …
// Поля письма задаёт отправитель. Слишком длинное значение обрезается, а не отклоняет пачку: скрипт
// повторяет непринятую пачку целиком, и одно письмо с темой в 3000 знаков или со 101 вложением иначе
// навсегда останавливало бы приём всей почты поддержки.
const str = (max: number) =>
  z
    .string()
    .nullish()
    .catch(null)
    .transform((v) => (v == null ? v : v.slice(0, max)));
const attachment = z.object({ name: str(500), size: z.number().nonnegative().nullish().catch(null), type: str(200) });
const message = z.object({
  id: z.string().min(1).max(200),
  messageId: str(1000),
  from: str(1000),
  replyTo: str(1000),
  subject: str(2000),
  text: str(200_000),
  html: str(500_000),
  date: str(100),
  spam: z.boolean().nullish().catch(null),
  attachments: z
    .array(z.unknown())
    .optional()
    .catch(undefined)
    .transform((list) => list?.slice(0, 100).flatMap((a) => {
      const r = attachment.safeParse(a);
      return r.success ? [r.data] : [];
    })),
});
const schema = z.object({
  initial: z.boolean().optional(),
  messages: z.array(z.unknown()).max(50),
});

const MAX_BODY = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secretMatches(got, process.env.SUPPORT_MAIL_WEBHOOK_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return new Response("Too Large", { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response("Too Large", { status: 413 });
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(JSON.parse(raw));
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  // Каждое письмо проверяется отдельно: письмо без идентификатора (скрипт таких не шлёт) пропускается,
  // остальные из пачки принимаются
  const messages = body.messages.flatMap((m) => {
    const r = message.safeParse(m);
    return r.success ? [r.data] : [];
  });
  const skipped = body.messages.length - messages.length;
  if (skipped) console.error(`support-mail inbound: skipped ${skipped} malformed message(s)`);
  const created = await ingestWebhookMails(messages, !!body.initial);
  return Response.json({ ok: true, created, skipped });
}

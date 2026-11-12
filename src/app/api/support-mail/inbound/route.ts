import { z } from "zod";
import { secretMatches } from "@/lib/secret-compare";
import { ingestWebhookMails } from "@/lib/support-mail";

// Письма в поддержку от скрипта Google в Gmail (deploy/gmail-apps-script.gs).
// Скрипт шлёт секрет SUPPORT_MAIL_WEBHOOK_SECRET в заголовке Authorization: Bearer …
const str = (max: number) => z.string().max(max).nullish();
const schema = z.object({
  initial: z.boolean().optional(),
  messages: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        messageId: str(1000),
        from: str(1000),
        replyTo: str(1000),
        subject: str(2000),
        text: str(200_000),
        html: str(500_000),
        date: str(100),
        attachments: z.array(z.object({ name: str(500), size: z.number().nonnegative().nullish(), type: str(200) })).max(100).optional(),
      }),
    )
    .max(50),
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
  const created = await ingestWebhookMails(body.messages, !!body.initial);
  return Response.json({ ok: true, created });
}

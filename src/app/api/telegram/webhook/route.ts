import { handleTelegramUpdate } from "@/lib/login-code";
import type { TgUpdate } from "@/lib/login-code-core";
import { secretMatches } from "@/lib/secret-compare";

// Вебхук бота входа. Telegram присылает секрет, заданный при setWebhook (npm run telegram:login),
// в заголовке X-Telegram-Bot-Api-Secret-Token — без него запрос отклоняется.
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_LOGIN_WEBHOOK_SECRET ?? "";
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!process.env.TELEGRAM_LOGIN_BOT_TOKEN || !secretMatches(got, secret)) {
    return new Response("Forbidden", { status: 403 });
  }
  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  try {
    await handleTelegramUpdate(update);
  } catch (e) {
    // Ответ 200 всё равно: иначе Telegram будет повторять то же сообщение
    console.error("[telegram-login] update failed", e);
  }
  return new Response("ok");
}

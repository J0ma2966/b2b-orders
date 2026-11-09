// Бот для кодов входа одной командой (на сервере, из папки проекта):
//   sudo -u b2b npm run telegram:login -- <токен бота от @BotFather>
//   sudo systemctl restart b2b-orders
//
// Что делает:
//  1. Проверяет токен у Telegram (getMe) и записывает в .env TELEGRAM_LOGIN_BOT_TOKEN,
//     имя бота и секрет вебхука (TELEGRAM_LOGIN_WEBHOOK_SECRET, создаётся один раз).
//  2. Подключает вебхук https://<APP_DOMAIN>/api/telegram/webhook — сюда Telegram присылает сообщения боту.
//  3. Задаёт боту описание и команду /start на русском и узбекском.
// Без токена команда только переподключает вебхук с токеном из .env (например, после смены домена).
// Адрес сайта можно указать явно: npm run telegram:login -- <токен> https://example.uz
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ENV = join(ROOT, ".env");
const API = process.env.TELEGRAM_API ?? "https://api.telegram.org";
const ok = (s) => console.log(`  ✓ ${s}`);
const die = (s) => {
  console.error(`  ✗ ${s}`);
  process.exit(1);
};

if (!existsSync(ENV)) die(`нет файла ${ENV}`);
let env = readFileSync(ENV, "utf8");
const getEnv = (key) => env.match(new RegExp(`^${key}=["']?([^"'\\r\\n]*)["']?\\s*$`, "m"))?.[1] ?? "";
const setEnv = (key, value) => {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, line) : `${env.replace(/\n?$/, "\n")}${line}\n`;
};

const args = process.argv.slice(2);
const token = args.find((a) => /^\d+:[\w-]{30,}$/.test(a)) ?? getEnv("TELEGRAM_LOGIN_BOT_TOKEN");
const urlArg = args.find((a) => /^https:\/\//.test(a));
if (!token) die("укажите токен бота: npm run telegram:login -- 123456:ABC…  (токен выдаёт @BotFather → /newbot)");
const domain = getEnv("APP_DOMAIN");
const base = (urlArg ?? (domain ? `https://${domain}` : "")).replace(/\/$/, "");
if (!base) die("не знаю адрес сайта: задайте APP_DOMAIN в .env или укажите https://… вторым аргументом");

async function call(method, payload = {}) {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!data?.ok) die(`Telegram ${method}: ${data?.description ?? res.status}`);
  return data.result;
}

console.log("\nБот для кодов входа");
const me = await call("getMe");
ok(`бот @${me.username}`);

const secret = getEnv("TELEGRAM_LOGIN_WEBHOOK_SECRET") || randomBytes(24).toString("hex");
setEnv("TELEGRAM_LOGIN_BOT_TOKEN", token);
setEnv("TELEGRAM_LOGIN_BOT_USERNAME", me.username);
setEnv("TELEGRAM_LOGIN_WEBHOOK_SECRET", secret);
writeFileSync(ENV, env);
ok(".env обновлён");

await call("setWebhook", { url: `${base}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
ok(`вебхук ${base}/api/telegram/webhook`);

const texts = {
  ru: { cmd: "Подключить номер для кодов входа", short: "Коды для входа на платформу оптовых заказов", about: "Здесь приходят коды для входа на платформу оптовых заказов. Нажмите «Старт», затем «Поделиться номером»." },
  uz: { cmd: "Kirish kodlari uchun raqamni ulash", short: "Ulgurji buyurtmalar platformasiga kirish kodlari", about: "Bu yerga ulgurji buyurtmalar platformasiga kirish kodlari keladi. «Start», soʻng «Raqamni ulashish» tugmasini bosing." },
};
for (const [lang, t] of Object.entries(texts)) {
  const language_code = lang === "ru" ? undefined : lang;
  await call("setMyCommands", { commands: [{ command: "start", description: t.cmd }], ...(language_code ? { language_code } : {}) });
  await call("setMyShortDescription", { short_description: t.short, ...(language_code ? { language_code } : {}) });
  await call("setMyDescription", { description: t.about, ...(language_code ? { language_code } : {}) });
}
ok("описание и команда /start (ru, uz)");
console.log(`\nГотово. Перезапустите сайт, чтобы он прочитал .env:  sudo systemctl restart b2b-orders\nБот: https://t.me/${me.username}\n`);

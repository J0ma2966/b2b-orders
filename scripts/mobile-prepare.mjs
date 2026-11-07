// Подготовка мобильной сборки под адрес сервера: страница «нет связи» и домены WKWebView на iOS.
// Запуск: MOBILE_SERVER_URL=https://заказы.uz npm run mobile:sync
import { readFileSync, writeFileSync } from "node:fs";

if (process.env.MOBILE_DEV_SETUP) {
  // Адрес сервера выбирается в самом приложении (отладочная сборка для локальной сети)
  writeFileSync(new URL("../mobile/www/app-config.js", import.meta.url), `window.APP_CONFIG = ${JSON.stringify({ serverUrl: null, devSetup: true })};\n`);
  console.log("Сервер приложения: выбирается при первом запуске (MOBILE_DEV_SETUP)");
  process.exit(0);
}

const url = new URL(process.env.MOBILE_SERVER_URL ?? "https://app.example.uz");
if (url.protocol !== "https:" && !process.env.MOBILE_ALLOW_HTTP) {
  console.error("MOBILE_SERVER_URL должен начинаться с https:// (для разработки: MOBILE_ALLOW_HTTP=1)");
  process.exit(1);
}

writeFileSync(new URL("../mobile/www/app-config.js", import.meta.url), `window.APP_CONFIG = ${JSON.stringify({ serverUrl: url.origin + "/" })};\n`);

const plist = new URL("../mobile/ios/App/App/Info.plist", import.meta.url);
const text = readFileSync(plist, "utf8");
const next = text.replace(/(<key>WKAppBoundDomains<\/key>\s*<array>)[\s\S]*?(<\/array>)/, `$1\n\t\t<string>${url.hostname}</string>\n\t$2`);
if (next === text && !text.includes(`<string>${url.hostname}</string>`)) throw new Error("В Info.plist не найден WKAppBoundDomains");
writeFileSync(plist, next);

console.log(`Сервер приложения: ${url.origin}`);

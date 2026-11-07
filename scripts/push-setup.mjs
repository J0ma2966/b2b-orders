// Настройка push-уведомлений одной командой: npm run push:setup
//
// Что делает:
//  1. Создаёт ключи VAPID для push в браузере (если их ещё нет в .env).
//  2. Находит ключ сервисного аккаунта Firebase (файл …-firebase-adminsdk-….json) в папке проекта
//     или в «Загрузках», проверяет его, кладёт в secrets/ и прописывает FCM_SERVICE_ACCOUNT_FILE в .env.
//  3. Находит google-services.json, проверяет имя приложения uz.b2borders.app и кладёт в mobile/android/app/.
//  4. Проверяет ключ у Google (получает токен доступа) — сразу видно, что push будет отправляться.
//
// Путь к файлам можно указать явно: npm run push:setup -- C:\Users\Я\Downloads\ключ.json C:\…\google-services.json
import { createSign } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import webpush from "web-push";

const ROOT = resolve(import.meta.dirname, "..");
const ENV = join(ROOT, ".env");
const APP_ID = process.env.MOBILE_APP_ID ?? "uz.b2borders.app";
const ok = (s) => console.log(`  ✓ ${s}`);
const warn = (s) => console.log(`  ! ${s}`);
const step = (s) => console.log(`\n${s}`);

// ─── .env ───
if (!existsSync(ENV)) {
  copyFileSync(join(ROOT, ".env.example"), ENV);
  ok(".env создан из .env.example");
}
let env = readFileSync(ENV, "utf8");
const getEnv = (key) => env.match(new RegExp(`^${key}=["']?([^"'\\r\\n]*)["']?\\s*$`, "m"))?.[1] ?? "";
function setEnv(key, value) {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, line) : `${env.replace(/\s*$/, "")}\n${line}\n`;
}

// ─── Поиск файлов ───
const args = process.argv.slice(2).map((p) => resolve(p));
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
};
const isServiceAccount = (j) => j?.type === "service_account" && j.project_id && j.client_email && j.private_key;
const isGoogleServices = (j) => Array.isArray(j?.client) && j.project_info?.project_id;

function candidates() {
  const dirs = [ROOT, join(ROOT, "secrets"), join(homedir(), "Downloads"), join(homedir(), "Загрузки"), join(homedir(), "Desktop")];
  const files = [...args];
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const name of readdirSync(d)) {
      if (!/\.json$/i.test(name)) continue;
      if (/firebase-adminsdk|service.?account|google-services/i.test(name)) files.push(join(d, name));
    }
  }
  // Самые свежие — первыми
  return [...new Set(files)].filter((f) => existsSync(f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}
const found = candidates().map((file) => ({ file, json: readJson(file) }));

// ─── 1. VAPID ───
step("1. Push в браузере (ключи VAPID)");
if (getEnv("VAPID_PUBLIC_KEY") && getEnv("VAPID_PRIVATE_KEY")) {
  ok("ключи уже есть в .env");
} else {
  const keys = webpush.generateVAPIDKeys();
  setEnv("VAPID_PUBLIC_KEY", keys.publicKey);
  setEnv("VAPID_PRIVATE_KEY", keys.privateKey);
  ok("ключи созданы и записаны в .env");
}
console.log("    (в браузере push работает только по https; в приложении нужен Firebase — шаги 2–3)");

// ─── 2. Сервисный аккаунт Firebase (сервер отправляет push) ───
step("2. Ключ Firebase для сервера (FCM_SERVICE_ACCOUNT_FILE)");
const sa = found.find((f) => isServiceAccount(f.json));
let saJson = null;
if (sa) {
  mkdirSync(join(ROOT, "secrets"), { recursive: true });
  const target = join(ROOT, "secrets", "firebase-service-account.json");
  if (resolve(sa.file) !== target) copyFileSync(sa.file, target);
  setEnv("FCM_SERVICE_ACCOUNT_FILE", "secrets/firebase-service-account.json");
  setEnv("FCM_SERVICE_ACCOUNT", "");
  saJson = sa.json;
  ok(`найден ${basename(sa.file)} (проект ${sa.json.project_id}) → secrets/firebase-service-account.json`);
} else if (getEnv("FCM_SERVICE_ACCOUNT_FILE") && existsSync(resolve(ROOT, getEnv("FCM_SERVICE_ACCOUNT_FILE")))) {
  saJson = readJson(resolve(ROOT, getEnv("FCM_SERVICE_ACCOUNT_FILE")));
  ok(`уже настроен: ${getEnv("FCM_SERVICE_ACCOUNT_FILE")}`);
} else {
  warn("файл ключа не найден. Firebase → ⚙ Project settings → Service accounts → Generate new private key,");
  warn("файл сохранится в «Загрузки» — запустите команду ещё раз.");
}

// ─── 3. google-services.json (нужен приложению при сборке) ───
step(`3. google-services.json для приложения (${APP_ID})`);
const gs = found.find((f) => isGoogleServices(f.json));
let gsOk = false;
if (gs) {
  const hasApp = gs.json.client.some((c) => c.client_info?.android_client_info?.package_name === APP_ID);
  if (!hasApp) {
    warn(`в ${basename(gs.file)} нет Android-приложения ${APP_ID}. В Firebase добавьте приложение именно с этим именем и скачайте файл заново.`);
  } else {
    const target = join(ROOT, "mobile", "android", "app", "google-services.json");
    if (resolve(gs.file) !== target) copyFileSync(gs.file, target);
    gsOk = true;
    ok(`найден ${basename(gs.file)} → mobile/android/app/google-services.json`);
    if (saJson && saJson.project_id !== gs.json.project_info.project_id) {
      warn(`ключ сервера из проекта ${saJson.project_id}, а google-services.json — из ${gs.json.project_info.project_id}. Оба файла должны быть из одного проекта Firebase.`);
    }
  }
} else {
  warn("файл не найден. Firebase → значок Android → имя пакета uz.b2borders.app → Download google-services.json, затем запустите команду ещё раз.");
}

writeFileSync(ENV, env);

// ─── 4. Проверка ключа у Google ───
step("4. Проверка ключа Firebase");
if (saJson) {
  try {
    const b64 = (x) => Buffer.from(x).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64(JSON.stringify({ iss: saJson.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
    const signer = createSign("RSA-SHA256");
    signer.update(`${head}.${claims}`);
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${signer.sign(saJson.private_key).toString("base64url")}` }),
    });
    if (res.ok) ok("Google принял ключ — сервер сможет отправлять push");
    else warn(`Google отклонил ключ (${res.status}): ${(await res.text()).slice(0, 200)}. Создайте новый ключ в Firebase.`);
  } catch (e) {
    warn(`нет связи с Google (${e.message}). Проверьте интернет на этом компьютере.`);
  }
} else {
  console.log("    пропущено — нет ключа");
}

// ─── Итог ───
step("Что дальше");
console.log("  • Перезапустите сервер (Ctrl+C, затем npm run build и npx next start -H 0.0.0.0 -p 3000).");
if (gsOk) {
  console.log("  • Приложение нужно пересобрать с Firebase. Через GitHub: репозиторий → Settings → Secrets and variables →");
  console.log("    Actions → New repository secret, имя GOOGLE_SERVICES_JSON, значение — всё содержимое файла");
  console.log("    mobile/android/app/google-services.json (откройте его в Блокноте, Ctrl+A, Ctrl+C).");
  console.log("    Затем Actions → Mobile → Run workflow, скачайте новый APK и установите его поверх старого.");
}
console.log("  • В приложении: Профиль → «Включить push на этом устройстве» → Разрешить.\n");

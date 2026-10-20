// Проверка узбекского интерфейса: обходит страницы каждой роли с языком uz и печатает строки,
// в которых осталась кириллица (кроме данных из сквозного сценария).
// Запуск после tests/e2e/flow.mjs на той же базе: DATABASE_URL=… node tests/e2e/uz-scan.mjs
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_OUT ?? "/tmp";
const LIMIT = Number(process.env.SCAN_LIMIT ?? 80);
const db = process.env.DATABASE_URL.replace(/\?.*$/, "");
const sql = (q) => execFileSync("psql", [db, "-Atc", q], { encoding: "utf8" }).trim().split("\n")[0];

const roles = [
  { name: "admin", phone: "+998900000000", password: process.env.ADMIN_PW ?? "superadmin-1", start: "/admin" },
  { name: "supplier", phone: sql(`SELECT u.phone FROM "User" u JOIN "SupplierMember" m ON m."userId" = u.id WHERE m.role = 'OWNER' ORDER BY u."createdAt" DESC`), password: "supplier123", start: "/supplier" },
  { name: "courier", phone: sql(`SELECT u.phone FROM "User" u JOIN "SupplierMember" m ON m."userId" = u.id WHERE m.role = 'COURIER' ORDER BY u."createdAt" DESC`), password: "courier123", start: "/courier" },
  { name: "shop", phone: sql(`SELECT u.phone FROM "User" u JOIN "ShopMember" m ON m."userId" = u.id JOIN "Order" o ON o."shopId" = m."shopId" ORDER BY u."createdAt"`), password: "shop12345", start: "/shop" },
];

// Данные, введённые в сквозном сценарии: названия, имена, адреса, товары, причины
const DATA = [
  /ООО «Ташкент Опт \d+»/g, /Минимаркет «[^»]+»/g, /Магазин «[^»]+»/g, /Вода питьевая[^\n\t·,]*/g, /Напитки/g,
  /Алишер Каримов|Бобур Доставщик|Дильноза Юсупова|Супер-администратор|Фаррух[^\n\t,]*/g, /Чиланзар[^\n\t]*/g, /Ташкент, ул\. Навои, 1/g,
  /ул\.[^\n\t]*/g, /Оптовая торговля[^\n\t]*/g, /Ошибка в цене[^\n\t]*/g, /Повреждённая упаковка[^\n\t]*/g, /Рус\b/g, /Язык/g,
];
const CYR = /[А-Яа-яЁё]/;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const report = new Map(); // строка -> страницы

async function scan(page, url) {
  const text = await page.locator("body").innerText();
  for (let line of text.split("\n")) {
    for (const re of DATA) line = line.replace(re, "");
    line = line.trim();
    if (!CYR.test(line)) continue;
    if (!report.has(line)) report.set(line, new Set());
    report.get(line).add(url.replace(BASE, ""));
  }
}

async function newContext() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "uz-UZ" });
  await ctx.addCookies([{ name: "lang", value: "uz", url: BASE }]);
  return ctx;
}

// Страницы до входа
{
  const page = await (await newContext()).newPage();
  for (const p of ["/", "/login", "/register/shop", "/register/supplier", "/nope-404"]) {
    await page.goto(BASE + p);
    await scan(page, BASE + p);
  }
  await page.goto(BASE + "/login");
  await page.screenshot({ path: `${OUT}/uz-login.png` });
}

for (const role of roles) {
  const page = await (await newContext()).newPage();
  await page.goto(`${BASE}/login`);
  await page.locator("[name=phone]").fill(role.phone);
  await page.locator("[name=password]").fill(role.password);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  const seen = new Set();
  const queue = [role.start, "/account", "/notifications"];
  while (queue.length && seen.size < LIMIT) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await page.goto(BASE + path);
    if (!res || res.status() >= 400) {
      console.log(`! ${role.name} ${path}: ${res?.status()}`);
      continue;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await scan(page, page.url());
    const links = await page.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")));
    for (const href of links) {
      const clean = href.split("#")[0];
      // Похожие страницы (другие фильтры и страницы списка) не нужны
      const key = clean.replace(/\?.*$/, "");
      if (!seen.has(key) && !queue.includes(key) && !/logout|\.(png|jpg|webp|mp4)$/.test(key)) queue.push(key);
    }
  }
  await page.goto(BASE + role.start);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.locator("h1").first().waitFor().catch(() => {});
  await page.screenshot({ path: `${OUT}/uz-${role.name}.png`, fullPage: true });
  console.log(`${role.name}: ${seen.size} страниц`);
}

for (const [line, pages] of report) console.log(`${line}\t${[...pages].slice(0, 3).join(" ")}`);
console.log(`Строк с кириллицей: ${report.size}`);
await browser.close();

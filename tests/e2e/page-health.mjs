// Обход всех страниц каждой роли на русском и узбекском, на телефоне (как в приложении) и на компьютере.
// Ищет: ответы 4xx/5xx, ошибки в консоли и на странице, неудачные запросы к своему серверу,
// битые картинки, ссылки на несуществующие страницы и горизонтальную прокрутку на телефоне.
// Запуск после tests/e2e/flow.mjs на той же базе: DATABASE_URL=… node tests/e2e/page-health.mjs
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LIMIT = Number(process.env.SCAN_LIMIT ?? 80);
const db = process.env.DATABASE_URL.replace(/\?.*$/, "");
const sql = (q) => execFileSync("psql", [db, "-Atc", q], { encoding: "utf8" }).trim().split("\n")[0];

const roles = [
  { name: "admin", phone: "+998900000000", password: process.env.ADMIN_PW ?? "superadmin-1", start: "/admin" },
  { name: "supplier", phone: sql(`SELECT u.phone FROM "User" u JOIN "SupplierMember" m ON m."userId" = u.id WHERE m.role = 'OWNER' ORDER BY u."createdAt" DESC`), password: "supplier123", start: "/supplier" },
  { name: "courier", phone: sql(`SELECT u.phone FROM "User" u JOIN "SupplierMember" m ON m."userId" = u.id WHERE m.role = 'COURIER' ORDER BY u."createdAt" DESC`), password: "courier123", start: "/courier" },
  { name: "shop", phone: sql(`SELECT u.phone FROM "User" u JOIN "ShopMember" m ON m."userId" = u.id JOIN "Order" o ON o."shopId" = m."shopId" ORDER BY u."createdAt"`), password: "shop12345", start: "/shop" },
];
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 B2BOrdersApp/1" },
  desktop: { viewport: { width: 1280, height: 900 } },
};
// Шум, не связанный с приложением
const IGNORE = [/Download the React DevTools/, /\[Fast Refresh\]/, /favicon/, /Failed to load resource.*\/_next\/static/];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const add = (where, what) => problems.push(`${where}: ${what}`);

async function run(role, lang, device) {
  const ctx = await browser.newContext(DEVICES[device]);
  await ctx.addCookies([{ name: "lang", value: lang, url: BASE }]);
  const page = await ctx.newPage();
  let current = "";
  const tag = () => `${role.name}/${lang}/${device} ${current}`;
  page.on("console", (m) => {
    // Чужие ресурсы (плитки карты OpenStreetMap) от нас не зависят
    const external = /Failed to load resource/.test(m.text()) && !(m.location().url ?? "").startsWith(BASE);
    if (m.type() === "error" && !external && !IGNORE.some((r) => r.test(m.text()))) add(tag(), `console: ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => add(tag(), `pageerror: ${e.message.slice(0, 200)}`));
  page.on("response", (r) => {
    const u = r.url();
    if (u.startsWith(BASE) && r.status() >= 400 && !/\/api\/live/.test(u)) add(tag(), `HTTP ${r.status()} ${u.replace(BASE, "")}`);
  });

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
    current = path;
    const res = await page.goto(BASE + path).catch((e) => (add(tag(), `goto: ${e.message.slice(0, 120)}`), null));
    if (!res) continue;
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const check = await page.evaluate(() => {
      const de = document.documentElement;
      const wide = [...document.querySelectorAll("body *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > de.clientWidth + 2 && getComputedStyle(el).position !== "fixed" && !el.closest("[data-scroll-x], .overflow-x-auto, .overflow-auto, .overflow-x-scroll, table");
        })
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} «${(el.textContent ?? "").trim().slice(0, 30)}»`);
      const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src.startsWith(location.origin)).map((i) => i.src);
      return { overflow: de.scrollWidth > de.clientWidth + 2, wide, broken };
    });
    if (device === "phone" && check.overflow) add(tag(), `горизонтальная прокрутка: ${check.wide.join("; ")}`);
    for (const src of check.broken) add(tag(), `битая картинка ${src.replace(BASE, "")}`);
    const links = await page.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")));
    for (const href of links) {
      const key = href.split("#")[0].replace(/\?.*$/, "");
      if (!seen.has(key) && !queue.includes(key) && !/logout|^\/api\/|^\/files\/|\.(png|jpg|webp|mp4)$/.test(key)) queue.push(key);
    }
  }
  await ctx.close();
  return seen.size;
}

for (const role of roles) {
  for (const lang of ["ru", "uz"]) {
    for (const device of ["phone", "desktop"]) {
      const n = await run(role, lang, device);
      console.log(`${role.name}/${lang}/${device}: ${n} страниц`);
    }
  }
}
await browser.close();
for (const p of [...new Set(problems)]) console.log("!", p);
console.log(problems.length ? `Проблем: ${new Set(problems).size}` : "page-health ok");
process.exitCode = problems.length ? 1 : 0;

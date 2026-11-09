// Проверка вёрстки на узком телефоне (по умолчанию 360px): все страницы каждой роли на русском и узбекском.
// Ищет: горизонтальную прокрутку страницы, блоки, которые приходится листать вбок (широкие таблицы),
// текст, вылезающий за свою рамку или обрезанный, и заголовки таблиц, разбитые на много строк.
// Делает снимок каждой страницы в E2E_OUT/layout/<роль>-<язык>-<страница>.png.
// Запуск после tests/e2e/flow.mjs на той же базе: DATABASE_URL=… node tests/e2e/layout-scan.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = `${process.env.E2E_OUT ?? "/tmp"}/layout`;
const LIMIT = Number(process.env.SCAN_LIMIT ?? 80);
const WIDTH = Number(process.env.PHONE_WIDTH ?? 360);
const SHOTS = process.env.SHOTS !== "0";
const db = process.env.DATABASE_URL.replace(/\?.*$/, "");
const sql = (q) => execFileSync("psql", [db, "-Atc", q], { encoding: "utf8" }).trim().split("\n")[0];
mkdirSync(OUT, { recursive: true });

const roles = [
  { name: "admin", phone: "+998900000000", password: process.env.ADMIN_PW ?? "superadmin-1", start: "/admin" },
  { name: "supplier", phone: sql(`SELECT u.phone FROM "User" u JOIN "SupplierMember" m ON m."userId" = u.id WHERE m.role = 'OWNER' ORDER BY u."createdAt" DESC`), password: "supplier123", start: "/supplier" },
  { name: "courier", phone: sql(`SELECT u.phone FROM "User" u JOIN "SupplierMember" m ON m."userId" = u.id WHERE m.role = 'COURIER' ORDER BY u."createdAt" DESC`), password: "courier123", start: "/courier" },
  { name: "shop", phone: sql(`SELECT u.phone FROM "User" u JOIN "ShopMember" m ON m."userId" = u.id JOIN "Order" o ON o."shopId" = m."shopId" ORDER BY u."createdAt"`), password: "shop12345", start: "/shop" },
].filter((r) => !process.env.ROLES || process.env.ROLES.split(",").includes(r.name));
const phone = { viewport: { width: WIDTH, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 B2BOrdersApp/1" };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const warnings = [];

async function run(role, lang) {
  const ctx = await browser.newContext(phone);
  await ctx.addCookies([{ name: "lang", value: lang, url: BASE }]);
  const page = await ctx.newPage();
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
    const res = await page.goto(BASE + path).catch(() => null);
    if (!res) continue;
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    const found = await page.evaluate(() => {
      const out = [];
      const de = document.documentElement;
      const label = (el) => `${el.tagName.toLowerCase()} «${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}»`;
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
      if (de.scrollWidth > de.clientWidth + 2) out.push("страница прокручивается вбок");
      for (const el of document.querySelectorAll("body *")) {
        if (!visible(el) || el.closest("[data-scroll-x], .leaflet-container, svg, [aria-hidden=true]")) continue;
        const cs = getComputedStyle(el);
        // Блок, который надо листать вбок (кроме лент-«каруселей» с флажком data-scroll-x)
        if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 4 && el.querySelector("table")) out.push(`таблицу надо листать вбок: ${label(el.querySelector("table"))} ${el.scrollWidth}px > ${el.clientWidth}px`);
        // Текст вылезает из своей рамки
        if (cs.overflowX === "visible" && !/(inline|contents)/.test(cs.display) && el.scrollWidth > el.clientWidth + 4 && el.children.length === 0 && el.clientWidth > 0) out.push(`текст не помещается: ${label(el)}`);
        // Текст обрезан (без многоточия)
        if (cs.overflowX === "hidden" && cs.textOverflow !== "ellipsis" && el.children.length === 0 && el.scrollWidth > el.clientWidth + 4) out.push(`текст обрезан: ${label(el)}`);
        // Обрезано многоточием — иногда так задумано (длинные названия в списках), поэтому только предупреждение
        if (cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1) out.push(`~ многоточие: ${label(el)}`);
        // Заголовок или ячейка таблицы, разбитые на 3+ строки
        if ((el.tagName === "TH" || el.tagName === "TD") && el.textContent.trim().length > 0 && getComputedStyle(el).display === "table-cell") {
          const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
          const h = el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
          if (h > lh * 2.6) out.push(`ячейка в ${Math.round(h / lh)} строк: ${label(el)}`);
        }
        // Отступ «p-0» не сработал (двойные поля у карточки)
        if (/(^|\s)p-0(\s|$)/.test(el.className) && parseFloat(cs.paddingLeft) > 0 && !/(^|\s)(px|pl)-/.test(el.className)) out.push(`p-0 не сработал: ${label(el)}`);
      }
      // Элементы за краем экрана (не внутри прокручиваемых лент и не обрезанные родителем-рамкой)
      for (const el of document.querySelectorAll("h1,h2,h3,p,span,a,button,td,th,label,div")) {
        if (!visible(el) || el.children.length > 0 || el.closest("[aria-hidden=true]")) continue;
        const r = el.getBoundingClientRect();
        let p = el.parentElement, scroller = false;
        while (p && p !== document.body) { if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) { scroller = true; break; } p = p.parentElement; }
        if (!scroller && getComputedStyle(el).position !== "fixed" && (r.left < -1 || r.right > de.clientWidth + 1)) out.push(`за краем экрана: ${label(el)}`);
      }
      return [...new Set(out)].slice(0, 12);
    });
    const slug = path.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 60) || "root";
    if (SHOTS) await page.screenshot({ path: `${OUT}/${role.name}-${lang}-${slug}.png`, fullPage: true }).catch(() => {});
    for (const f of found) (f.startsWith("~") ? warnings : problems).push(`${role.name}/${lang} ${path}: ${f.replace(/^~ /, "")}`);
    const links = await page.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")));
    for (const href of links) {
      const key = href.split("#")[0].replace(/\?.*$/, "");
      if (!seen.has(key) && !queue.includes(key) && !/logout|^\/api\/|^\/files\/|^\/documents\/|\.(png|jpg|webp|mp4)$/.test(key)) queue.push(key);
    }
  }
  await ctx.close();
  return seen.size;
}

for (const role of roles) {
  for (const lang of ["ru", "uz"]) console.log(`${role.name}/${lang}: ${await run(role, lang)} страниц`);
}
await browser.close();
for (const w of warnings) console.log("~", w);
for (const p of problems) console.log("!", p);
console.log(problems.length ? `Проблем вёрстки: ${problems.length}` : "layout ok");
process.exitCode = problems.length ? 1 : 0;

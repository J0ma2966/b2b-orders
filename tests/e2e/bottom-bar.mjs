// Плавающие нижние панели магазина не закрывают последний товар/строку: каталог поставщика (корзина и
// «До минимальной суммы…»), карточка товара («− N + / В корзину») и корзина («Итого»). Телефон 360/390 и ПК.
// Запуск после flow.mjs и mobile-fixes.mjs: node tests/e2e/bottom-bar.mjs ru|uz
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_OUT ?? "/tmp";
const SHOTS = process.env.SHOTS !== "0";
const lang = process.argv[2] ?? "ru";
const db = process.env.DATABASE_URL.replace(/\?.*$/, "");
const sql = (q) => execFileSync("psql", [db, "-Atc", q], { encoding: "utf8" }).trim().split("\n")[0];
const log = (...a) => console.log("•", ...a);

// Поставщик с самым большим каталогом и магазин в его районе
const supplierId = sql(
  `SELECT p."supplierId" FROM "Product" p JOIN "Supplier" s ON s.id = p."supplierId" WHERE s.status = 'ACTIVE' AND p."archivedAt" IS NULL GROUP BY p."supplierId" ORDER BY count(*) DESC`,
);
const shopPhone = sql(
  `SELECT u.phone FROM "User" u JOIN "ShopMember" m ON m."userId" = u.id JOIN "Order" o ON o."shopId" = m."shopId"
   WHERE m.role = 'OWNER' AND o."supplierId" = '${supplierId}' ORDER BY o."createdAt" DESC`,
);
assert.ok(supplierId && shopPhone, "нет данных: сначала запустите flow.mjs и mobile-fixes.mjs");
// Строка «До минимальной суммы осталось …» делает панель выше — именно с ней товар и прятался
const prevMin = sql(`SELECT coalesce("minOrderTotal"::text, 'NULL') FROM "Supplier" WHERE id = '${supplierId}'`);
sql(`UPDATE "Supplier" SET "minOrderTotal" = 300000, "ordersDisabled" = false WHERE id = '${supplierId}' RETURNING id`);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function open(width, height, mobile) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    ...(mobile ? { userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36" } : {}),
  });
  await ctx.addCookies([{ name: "lang", value: lang, url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator("[name=phone]").fill(shopPhone);
  await page.locator("[name=password]").fill("shop12345");
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => u.pathname.startsWith("/shop"), { timeout: 15000 });
  return page;
}

// Прокрутить до конца и проверить, что последний элемент списка целиком над панелью и в него можно нажать
async function checkBottom(page, itemSelector, what) {
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  const r = await page.evaluate((sel) => {
    const items = [...document.querySelectorAll(sel)].filter((el) => el.offsetParent !== null && el.getBoundingClientRect().height > 0 && !el.closest("[data-fixed-bottom], nav.fixed"));
    const last = items.at(-1);
    // Видимая часть панели (и нижнего меню на телефоне) — непрозрачные блоки внутри фиксированных обёрток
    const bars = [...document.querySelectorAll("[data-fixed-bottom], nav.fixed")].flatMap((el) => [...el.children]);
    const top = Math.min(...bars.map((b) => b.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => r.top));
    if (!last) return { error: "нет элементов" };
    const box = last.getBoundingClientRect();
    const btn = last.matches("a,button") ? last : [...last.querySelectorAll("button, a, input")].at(-1) ?? last;
    const bb = btn.getBoundingClientRect();
    const hit = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
    return { bottom: Math.round(box.bottom), top: Math.round(top), reachable: !!hit && (btn === hit || btn.contains(hit)), count: items.length, vh: window.innerHeight };
  }, itemSelector);
  assert.ok(!r.error, `${what}: ${r.error}`);
  assert.ok(r.bottom <= r.top, `${what}: последний элемент (низ ${r.bottom}px) уходит под панель (верх ${r.top}px)`);
  assert.ok(r.reachable, `${what}: кнопка последнего элемента закрыта панелью`);
  log(`${what}: низ последнего ${r.bottom}px, панель с ${r.top}px, кнопка доступна (${r.count} шт.)`);
}

try {
  for (const [w, h, mobile] of [
    [360, 740, true],
    [390, 844, true],
    [1094, 640, false],
    [1440, 900, false],
  ]) {
    const kind = `${mobile ? "телефон" : "ПК"} ${w}px`;
    const page = await open(w, h, mobile);
    // Весь каталог сразу (?n=…), чтобы подгрузка не сдвигала конец списка
    await page.goto(`${BASE}/shop/suppliers/${supplierId}?n=100`);
    await page.locator("main a[href*='/products/']").first().waitFor();
    await checkBottom(page, "main .grid > *", `каталог поставщика, ${kind}`);
    if (SHOTS) await page.screenshot({ path: `${OUT}/bottom-bar-${lang}-supplier-${w}.png` });
    // Тот самый случай: «+» у последнего товара нажимается и товар попадает в корзину
    const addLabel = lang === "uz" ? /Savatga qo.shish: / : /Добавить в корзину: /;
    const plus = page.locator("main .grid").getByRole("button", { name: addLabel });
    const barText = () => page.locator("[data-fixed-bottom]").innerText();
    const before = await barText();
    await plus.last().click();
    const end = Date.now() + 10000;
    while ((await barText()) === before) {
      assert.ok(Date.now() < end, `«+» у последнего товара не сработал, ${kind}`);
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(600);
    // Ещё несколько товаров, чтобы корзина стала длиннее экрана
    if (w === 360) for (let i = 0; i < 9; i++) {
      await plus.nth(i).click();
      await page.waitForTimeout(500);
    }

    // Карточка товара: кнопка «В корзину» — нижняя панель, низ страницы должен быть над ней
    await page.locator("main a[href*='/products/']").last().click();
    await page.waitForURL((u) => u.pathname.includes("/products/"));
    await page.locator("input[name=qty]:visible").waitFor();
    await page.locator("button:visible", { hasText: lang === "uz" ? /Savatga/ : /В корзину/ }).last().click();
    await page.waitForTimeout(800);
    await checkBottom(page, "main section, main p, main h1, main h2", `карточка товара, ${kind}`);
    if (SHOTS) await page.screenshot({ path: `${OUT}/bottom-bar-${lang}-product-${w}.png` });

    // Корзина: последняя строка над плашкой «Итого» (на телефоне она ещё и над нижним меню)
    await page.goto(`${BASE}/shop/cart`);
    await page.locator("[data-testid=cart-total-bar]").waitFor();
    await checkBottom(page, "main section, main form, main .rounded-\\[1\\.75rem\\]", `корзина, ${kind}`);
    if (SHOTS) await page.screenshot({ path: `${OUT}/bottom-bar-${lang}-cart-${w}.png` });
    await page.context().close();
  }
  console.log(`bottom-bar ${lang} ok`);
} finally {
  sql(`UPDATE "Supplier" SET "minOrderTotal" = ${prevMin} WHERE id = '${supplierId}' RETURNING id`);
  sql(`DELETE FROM "Order" WHERE status = 'DRAFT' AND "supplierId" = '${supplierId}' RETURNING id`);
  await browser.close();
}

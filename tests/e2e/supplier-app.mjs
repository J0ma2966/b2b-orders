// Приложение поставщика на телефоне: нижняя панель, экран «Ещё», переход в режим доставки и обратно.
// Запуск на работающем сервере после flow.mjs:
// DATABASE_URL=… CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/e2e/supplier-app.mjs [ru|uz]
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_OUT ?? "/tmp";
const lang = process.argv[2] ?? "ru";
const db = process.env.DATABASE_URL.replace(/\?.*$/, "");
const sql = (q) => execFileSync("psql", [db, "-Atc", q], { encoding: "utf8" }).trim().split("\n")[0];
// Владелец активного поставщика, который развозит сам (так создаются новые поставщики)
const phone = sql(
  `SELECT u.phone FROM "User" u JOIN "SupplierMember" m ON m."userId" = u.id JOIN "Supplier" s ON s.id = m."supplierId"
   WHERE m.role = 'OWNER' AND m.delivers AND s.status = 'ACTIVE' ORDER BY u."createdAt" DESC`,
);
assert.ok(phone, "нет владельца поставщика с «Сам развожу»: сначала запустите flow.mjs");
const log = (...a) => console.log("•", ...a);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 B2BOrdersApp/1",
});
await ctx.addCookies([{ name: "lang", value: lang, url: BASE }]);
const page = await ctx.newPage();
const shot = (name) => page.screenshot({ path: `${OUT}/supplier-app-${lang}-${name}.png`, fullPage: true });
const L = (ru, uz) => (lang === "uz" ? uz : ru);

await page.goto(`${BASE}/login`);
await page.locator("[name=phone]").fill(phone);
await page.locator("[name=password]").fill("supplier123");
await page.locator("button[type=submit]").click();
await page.waitForURL(`${BASE}/supplier`, { timeout: 15000 });

// Нижняя панель: пока страница догружается потоком, в DOM бывает и её заглушка — берём видимую
const bottom = page.locator("nav.fixed:visible").last();
await bottom.waitFor();
for (const label of [L("Главная", "Bosh sahifa"), L("Заказы", "Buyurtmalar"), L("Магазины", "Doʻkonlar"), L("Склад", "Ombor"), L("Ещё", "Yana")]) {
  await bottom.getByText(label, { exact: true }).waitFor({ timeout: 5000 }).catch(() => assert.fail(`в нижней панели нет «${label}»`));
}
// Длинное верхнее меню на телефоне скрыто — разделы в нижней панели и «Ещё»
assert.equal(await page.locator("header nav").first().isVisible(), false, "на телефоне видно верхнее меню разделов");
log("нижняя панель: OK");
// Главная: выручка за сегодня, расчёты с магазинами по цветам, «Мои доставки» (поставщик развозит сам)
await page.getByTestId("revenue-today").waitFor();
const money = page.getByTestId("shop-money");
for (const tone of ["overdue", "due", "prepay"]) assert.equal(await money.locator(`[data-tone=${tone}]`).count(), 1, `на главной нет строки ${tone}`);
await page.getByTestId("my-deliveries").waitFor();
log("главная: выручка, расчёты с магазинами, мои доставки: OK");
await page.waitForTimeout(1200);
await shot("home");

// Магазины: итоги по цветам, список с цветом долга, карточка и шторка оплаты с предпросмотром
await bottom.getByText(L("Магазины", "Doʻkonlar"), { exact: true }).click();
await page.waitForURL(`${BASE}/supplier/shops`);
for (const tone of ["overdue", "due", "prepay"]) await page.getByTestId(`sum-${tone}`).waitFor();
const rows = page.getByTestId("shop-row");
assert.ok((await rows.count()) > 0, "в списке магазинов пусто");
const tones = await rows.evaluateAll((els) => els.map((e) => e.dataset.tone));
const order = { overdue: 0, due: 1, prepay: 2, none: 3 };
assert.deepEqual(tones, [...tones].sort((a, b) => order[a] - order[b]), `магазины не по порядку цвета: ${tones}`);
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, "магазины шире экрана");
log("магазины по цветам долга:", tones.join(", "));
await page.waitForTimeout(800);
await shot("shops");
await rows.first().click();
await page.waitForURL(/\/supplier\/shops\/.+/);
const hero = page.getByTestId("balance-hero");
await hero.waitFor();
const heroTone = await hero.getAttribute("data-tone");
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, "карточка магазина шире экрана");
assert.equal(heroTone, tones[0], "цвет карточки не совпадает со списком");
await page.getByRole("button", { name: L("Принять оплату", "Toʻlovni qabul qilish") }).click();
const sheet = page.getByTestId("pay-sheet");
await sheet.locator("[name=amount]").waitFor({ state: "visible" });
await sheet.locator("[name=amount]").fill("999999999");
assert.equal(await sheet.getByTestId("payment-after").getAttribute("data-tone"), "prepay", "переплата не зелёная в предпросмотре");
assert.equal(await sheet.locator("[name=amount]").inputValue(), "999 999 999", "сумма не разбита по разрядам");
await page.waitForTimeout(600);
await shot("pay-sheet");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
assert.equal(await sheet.getAttribute("data-open"), null, "шторка не закрылась");
log(`карточка магазина (${heroTone}) и шторка оплаты: OK`);

await bottom.getByText(L("Склад", "Ombor"), { exact: true }).click();
await page.waitForURL(`${BASE}/supplier/stock`);
await page.locator("h1").first().waitFor();
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert.ok(overflow <= 1, `остатки шире экрана на ${overflow}px`);
log("остатки без горизонтальной прокрутки: OK");
await shot("stock");

await bottom.getByText(L("Ещё", "Yana"), { exact: true }).click();
await page.waitForURL(`${BASE}/supplier/more`);
for (const href of ["/supplier/catalog", "/supplier/delivery", "/supplier/team", "/supplier/reports", "/account"]) {
  await page.locator(`main a[href="${href}"]`).first().waitFor({ timeout: 5000 }).catch((e) => assert.fail(`на экране «Ещё» нет ${href}: ${e.message.split("\n")[0]}`));
}
await shot("more");
log("экран «Ещё»: OK");

// Раздел из «Ещё» — нижняя панель остаётся, подсвечено «Ещё»
await page.locator('main a[href="/supplier/catalog"]').click();
await page.waitForURL(`${BASE}/supplier/catalog`);
await page.locator("h1").first().waitFor();
assert.equal(await bottom.locator('a[aria-current="page"]').getAttribute("href"), "/supplier/more");
// Профиль и уведомления — в оформлении кабинета поставщика с той же панелью
await page.goto(`${BASE}/account`);
await bottom.waitFor();
log("разделы и профиль с нижней панелью: OK");

// Режим доставки и обратно
await page.goto(`${BASE}/supplier/more`);
await page.getByTestId("delivery-mode").click();
await page.waitForURL(`${BASE}/courier`);
await page.locator("h1").first().waitFor();
await shot("courier");
await page.getByRole("link", { name: L("Кабинет поставщика", "Yetkazib beruvchi kabineti") }).click();
await page.waitForURL((u) => u.pathname.startsWith("/supplier"));
log("режим доставки и обратно в кабинет: OK");

await browser.close();
console.log("supplier-app ok");

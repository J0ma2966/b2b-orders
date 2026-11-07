// Счётчики разделов, всплывающее «Заказ оформлен», принудительная продажа → метка «Изменён» у магазина.
// Запуск на работающем сервере после flow.mjs:
// DATABASE_URL=… CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/e2e/badges.mjs [ru|uz]
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_OUT ?? "/tmp";
const lang = process.argv[2] ?? "ru";
const db = process.env.DATABASE_URL.replace(/\?.*$/, "");
const sql = (q) => execFileSync("psql", [db, "-Atc", q], { encoding: "utf8" }).trim().split("\n")[0];
const log = (...a) => console.log("•", ...a);
const L = (ru, uz) => (lang === "uz" ? uz : ru);

// Поставщик из flow.mjs и магазин в его районе, у которого есть заказы у этого поставщика
const supplierId = sql(`SELECT s.id FROM "Supplier" s JOIN "SupplierMember" m ON m."supplierId" = s.id WHERE m.role = 'OWNER' AND s.status = 'ACTIVE' ORDER BY s."createdAt" DESC`);
const supplierPhone = sql(`SELECT u.phone FROM "User" u JOIN "SupplierMember" m ON m."userId" = u.id WHERE m."supplierId" = '${supplierId}' AND m.role = 'OWNER'`);
const shopPhone = sql(
  `SELECT u.phone FROM "User" u JOIN "ShopMember" m ON m."userId" = u.id JOIN "Order" o ON o."shopId" = m."shopId"
   WHERE m.role = 'OWNER' AND o."supplierId" = '${supplierId}' ORDER BY o."createdAt" DESC`,
);
assert.ok(supplierId && supplierPhone && shopPhone, "нет данных: сначала запустите flow.mjs");
// Чистое начало: уведомления магазина прочитаны, корзина у этого поставщика пуста
sql(`UPDATE "Notification" SET "readAt" = now() WHERE "readAt" IS NULL AND "userId" = (SELECT id FROM "User" WHERE phone = '${shopPhone}')`);
// Пустая корзина у этого поставщика (корзина не резервирует товар — её можно просто удалить)
sql(
  `DELETE FROM "Order" WHERE status = 'DRAFT' AND "supplierId" = '${supplierId}'
   AND "shopId" IN (SELECT m."shopId" FROM "ShopMember" m JOIN "User" u ON u.id = m."userId" WHERE u.phone = '${shopPhone}')`,
);
// flow.mjs в конце убирает товары из каталога — добавляем два товара с остатком
const sfx = Date.now().toString(36);
for (const [name, price] of [["Сок яблочный 1 л", 14000], ["Печенье овсяное", 9000]]) {
  sql(
    `WITH p AS (INSERT INTO "Product" (id, "supplierId", name, sku, "updatedAt") VALUES ('e2e-p-${sfx}-${price}', '${supplierId}', '${name}', 'E2E-${sfx}-${price}', now()) RETURNING id)
     INSERT INTO "ProductUnit" (id, "productId", kind, price, "physicalQty", "updatedAt") SELECT 'e2e-u-${sfx}-${price}', id, 'PIECE', ${price}, 50, now() FROM p RETURNING id`,
  );
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function phone(phoneNo, password, home) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36",
  });
  await ctx.addCookies([{ name: "lang", value: lang, url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator("[name=phone]").fill(phoneNo);
  await page.locator("[name=password]").fill(password);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => u.pathname.startsWith(home), { timeout: 15000 });
  return page;
}
const bottomOf = (page) => page.locator("nav.fixed:visible").last();
const badgeOf = async (page, href) => {
  const b = bottomOf(page).locator(`a[href="${href}"] [data-testid=nav-badge]`);
  return (await b.count()) ? Number((await b.first().innerText()).replace("+", "")) : 0;
};

// 1. Магазин: товар в корзину → счётчик корзины; «Оформить заказ» → всплывающее сообщение
const shop = await phone(shopPhone, "shop12345", "/shop");
await shop.goto(`${BASE}/shop/suppliers/${supplierId}`);
const plus = shop.locator('button[aria-label^="' + L("Добавить в корзину", "Savatga") + '"]').first();
await plus.waitFor({ timeout: 10000 });
const cartBefore = await badgeOf(shop, "/shop/cart");
await plus.click();
await shop.waitForFunction((n) => {
  const b = [...document.querySelectorAll('nav.fixed a[href="/shop/cart"] [data-testid=nav-badge]')].pop();
  return b && Number(b.textContent) > n;
}, cartBefore, { timeout: 10000 });
log("счётчик корзины в нижней панели:", await badgeOf(shop, "/shop/cart"));

await shop.goto(`${BASE}/shop/cart/${supplierId}`);
await shop.locator("form button[type=submit]", { hasText: L("Оформить заказ", "Buyurtmani rasmiylashtirish") }).last().click();
await shop.waitForURL(/\/shop\/orders\/[^/?]+/, { timeout: 15000 });
const toast = shop.getByTestId("toast");
await toast.waitFor({ timeout: 5000 });
await shop.waitForTimeout(400); // анимация появления
log("всплывающее сообщение:", (await toast.innerText()).replace(/\s+/g, " "));
await shop.screenshot({ path: `${OUT}/badges-${lang}-toast.png` });
assert.ok(!shop.url().includes("placed="), "параметр placed остался в адресе — сообщение покажется снова");
const orderId = new URL(shop.url()).pathname.split("/").pop();

// 2. Поставщик добавляет товар в этот заказ (принудительная продажа)
const sup = await phone(supplierPhone, "supplier123", "/supplier");
log("счётчик «Заказы» у поставщика:", await badgeOf(sup, "/supplier/orders"));
await sup.goto(`${BASE}/supplier/orders/${orderId}`);
const unitSelect = sup.locator('select[name="unitId"]').last();
await unitSelect.waitFor();
const firstUnit = await unitSelect.locator("option").nth(1).getAttribute("value");
await unitSelect.selectOption(firstUnit);
await sup.locator('input[name="qty"]').last().fill("1");
await sup.getByRole("button", { name: L("Добавить как принудительную продажу", "Majburiy sotuv sifatida qoʻshish") }).click();
// Ждём, пока позиция появится в заказе
for (let i = 0; i < 50 && sql(`SELECT count(*) FROM "OrderItem" WHERE "orderId" = '${orderId}' AND kind = 'FORCED'`) === "0"; i++) await sup.waitForTimeout(200);
assert.notEqual(sql(`SELECT count(*) FROM "OrderItem" WHERE "orderId" = '${orderId}' AND kind = 'FORCED'`), "0", "принудительная позиция не добавилась");
log("поставщик добавил товар в заказ");

// 3. Магазин: счётчик «Заказы», метка «Изменён» на карточке, после открытия заказа гаснут
await shop.goto(`${BASE}/shop/orders`);
await shop.getByTestId("order-changed").first().waitFor({ timeout: 10000 });
const ordersBadge = await badgeOf(shop, "/shop/orders");
assert.ok(ordersBadge >= 1, "нет счётчика у «Заказы»");
log("метка «Изменён» на карточке, счётчик «Заказы»:", ordersBadge);
await shop.screenshot({ path: `${OUT}/badges-${lang}-changed.png` });

await shop.locator(`a[href="/shop/orders/${orderId}"]`).first().click();
await shop.getByTestId("order-changed-alert").waitFor({ timeout: 10000 });
await shop.screenshot({ path: `${OUT}/badges-${lang}-order.png` });
// SeenTracker отмечает прочитанным и обновляет меню
await shop.waitForFunction(() => !document.querySelector('nav.fixed a[href="/shop/orders"] [data-testid=nav-badge]'), null, { timeout: 10000 });
await shop.goto(`${BASE}/shop/orders`);
await shop.locator("h1").first().waitFor();
assert.equal(await shop.getByTestId("order-changed").count(), 0, "метка «Изменён» не погасла после просмотра заказа");
log("после просмотра заказа метка и счётчик погасли: OK");

await browser.close();
console.log("badges ok");

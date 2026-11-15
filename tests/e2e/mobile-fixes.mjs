// Исправления мобильного приложения от 15.11.2026: числовые поля, артикул, сжатие фото, звёздочки
// обязательных полей, ввод количества, поиск поставщиков, комментарий и принудительная продажа в заказе,
// предупреждения у кнопки приёмки, выбор товаров в корзине, перевод «Карта», журнал склада, подгрузка по 10.
// Запуск на работающем сервере после flow.mjs:
// DATABASE_URL=… CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/e2e/mobile-fixes.mjs [ru|uz]
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_OUT ?? "/tmp";
const SHOTS = process.env.SHOTS !== "0";
const lang = process.argv[2] ?? "ru";
const db = process.env.DATABASE_URL.replace(/\?.*$/, "");
const sqlAll = (q) => execFileSync("psql", [db, "-Atc", q], { encoding: "utf8" }).trim();
const sql = (q) => sqlAll(q).split("\n")[0];
const log = (...a) => console.log("•", ...a);
const L = (ru, uz) => (lang === "uz" ? uz : ru);
const sfx = Date.now().toString(36);

// Поставщик из flow.mjs (сам развозит) и магазин в его районе
const supplierId = sql(`SELECT s.id FROM "Supplier" s JOIN "SupplierMember" m ON m."supplierId" = s.id WHERE m.role = 'OWNER' AND s.status = 'ACTIVE' ORDER BY s."createdAt"`);
const supplierUser = sql(`SELECT u.id FROM "User" u JOIN "SupplierMember" m ON m."userId" = u.id WHERE m."supplierId" = '${supplierId}' AND m.role = 'OWNER'`);
const supplierPhone = sql(`SELECT phone FROM "User" WHERE id = '${supplierUser}'`);
const [shopId, shopPhone, shopTerritory] = sql(
  `SELECT s.id || '|' || u.phone || '|' || s."territoryId" FROM "User" u JOIN "ShopMember" m ON m."userId" = u.id JOIN "Shop" s ON s.id = m."shopId" JOIN "Order" o ON o."shopId" = s.id
   WHERE m.role = 'OWNER' AND o."supplierId" = '${supplierId}' ORDER BY o."createdAt" DESC`,
).split("|");
assert.ok(supplierId && supplierPhone && shopId && shopPhone, "нет данных: сначала запустите flow.mjs");

// Остатки прошлых (в т.ч. упавших) прогонов не должны попадать в ленту
sql(`UPDATE "Supplier" SET status = 'BLOCKED' WHERE id LIKE 'fx-s-%'`);
sql(`UPDATE "Product" SET "archivedAt" = now() WHERE id LIKE 'fx-p-%' AND "archivedAt" IS NULL`);
// Чистое начало: корзины магазина пусты, у поставщика нет минимальной суммы, «Сам развожу» включено
sql(`DELETE FROM "Order" WHERE status = 'DRAFT' AND "shopId" = '${shopId}'`);
sql(`UPDATE "Supplier" SET "minOrderTotal" = NULL, "orderCutoffHour" = NULL, "ordersDisabled" = false WHERE id = '${supplierId}'`);
sql(`UPDATE "SupplierMember" SET delivers = true WHERE "supplierId" = '${supplierId}' AND "userId" = '${supplierUser}'`);
// 25 товаров с остатком: лента и каталог подгружаются по 10
const addProduct = (sid, key, name, price, qty) =>
  sql(
    `WITH p AS (INSERT INTO "Product" (id, "supplierId", name, sku, "updatedAt") VALUES ('fx-p-${sfx}-${key}', '${sid}', '${name}', 'FX-${sfx}-${key}', now()) RETURNING id)
     INSERT INTO "ProductUnit" (id, "productId", kind, price, "physicalQty", "updatedAt") SELECT 'fx-u-${sfx}-${key}', id, 'PIECE', ${price}, ${qty}, now() FROM p RETURNING id`,
  );
for (let i = 1; i <= 25; i++) addProduct(supplierId, `a${i}`, `Лимонад ${String(i).padStart(2, "0")} ${sfx}`, 5000 + i * 100, 50);
// Второй поставщик в том же районе: поиск по поставщикам и корзина из двух поставщиков
const otherId = `fx-s-${sfx}`;
const otherName = `Фруктовый двор ${sfx}`;
sql(
  `INSERT INTO "Supplier" (id, "legalName", "displayName", inn, "legalAddress", phone, email, "contactPerson", "officeAddress", status, "updatedAt")
   VALUES ('${otherId}', 'ООО Фрукты', '${otherName}', '${String(Date.now()).slice(-9)}', '-', '+998712000099', 'f@example.uz', '-', '-', 'ACTIVE', now()) RETURNING id`,
);
sql(`INSERT INTO "SupplierTerritory" ("supplierId", "territoryId") VALUES ('${otherId}', '${shopTerritory}') RETURNING "supplierId"`);
addProduct(otherId, "b1", `Яблоки ${sfx}`, 12000, 40);
addProduct(otherId, "b2", `Груши ${sfx}`, 15000, 40);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function phone(phoneNo, password, home, width = 390) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36",
  });
  await ctx.addCookies([{ name: "lang", value: lang, url: BASE }]);
  const page = await ctx.newPage();
  if (phoneNo) {
    await page.goto(`${BASE}/login`);
    await page.locator("[name=phone]").fill(phoneNo);
    await page.locator("[name=password]").fill(password);
    await page.locator("button[type=submit]").click();
    await page.waitForURL((u) => u.pathname.startsWith(home), { timeout: 15000 });
  }
  return page;
}
const shot = async (page, name, opts = {}) => SHOTS && page.screenshot({ path: `${OUT}/fixes-${lang}-${name}.png`, ...opts });
const until = async (fn, what, ms = 15000) => {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.fail(`не дождались: ${what}`);
};

// ───── 4. Регистрация: звёздочки обязательных полей ─────
{
  const page = await phone(null);
  for (const [url, min] of [["/register/shop", 9], ["/register/supplier", 12]]) {
    await page.goto(BASE + url);
    await page.locator("[data-testid=required-note]:visible").waitFor();
    const stars = await page.locator("[data-required]").count();
    assert.ok(stars >= min, `${url}: звёздочек ${stars}, ожидалось не меньше ${min}`);
    // У необязательного поля звёздочки нет
    const optional = page.locator("label", { has: page.locator(url.includes("shop") ? "[name=phone2]" : "[name=website]") });
    assert.equal(await optional.locator("[data-required]").count(), 0);
    log(`${url}: обязательных полей со звёздочкой ${stars - 1}`);
    await shot(page, `register-${url.split("/").pop()}`, { fullPage: true });
  }
  await page.context().close();
}

// ───── Поставщик: 1. числовые поля, 2. артикул, 3. сжатие фото ─────
const sup = await phone(supplierPhone, "supplier123", "/supplier");
{
  await sup.goto(`${BASE}/supplier/profile`);
  const min = sup.locator("[name=minOrderTotal]:visible");
  await min.scrollIntoViewIfNeeded();
  assert.equal(await min.getAttribute("inputmode"), "numeric");
  await min.fill("");
  await min.pressSequentially("5000a00,b0");
  assert.equal(await min.inputValue(), "5 000 000", "сумма разбита на разряды, буквы не вводятся");
  const hour = sup.locator("[name=orderCutoffHour]:visible");
  assert.equal(await hour.getAttribute("inputmode"), "numeric");
  await hour.fill("");
  await hour.pressSequentially("1x6");
  assert.equal(await hour.inputValue(), "16");
  await shot(sup, "terms");
  await hour.fill("");
  await hour.pressSequentially("99");
  assert.equal(await hour.inputValue(), "23", "час не больше 23");
  await hour.fill("16");
  await sup.locator("form", { has: min }).locator("button[type=submit]").click();
  await until(() => sql(`SELECT "minOrderTotal"::int || '/' || "orderCutoffHour" FROM "Supplier" WHERE id = '${supplierId}'`) === "5000000/16", "условия заказа сохранены");
  log("условия заказа: 5 000 000 и 16 сохранены");
  sql(`UPDATE "Supplier" SET "minOrderTotal" = NULL, "orderCutoffHour" = NULL WHERE id = '${supplierId}'`);

  await sup.goto(`${BASE}/supplier/catalog/new`);
  assert.equal(await sup.locator("[name=sku]:visible").count(), 0, "поля ввода артикула нет");
  await sup.locator("[data-testid=sku-readonly]:visible").waitFor();
  await sup.locator("[name=name]:visible").fill(`Вафли ${sfx}`);
  // Большое фото (шум 2600×2600, несколько МБ) → в форму попадает файл не больше 1 МБ
  const sizes = await sup.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = c.height = 2600;
    const g = c.getContext("2d");
    const img = g.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i++) img.data[i] = i % 4 === 3 ? 255 : Math.random() * 255;
    g.putImageData(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.95));
    const file = new File([blob], "big.jpg", { type: "image/jpeg" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const gallery = [...document.querySelectorAll("input[type=file]")].find((i) => !i.name && !i.hasAttribute("capture"));
    gallery.files = dt.files;
    gallery.dispatchEvent(new Event("change", { bubbles: true }));
    return { before: file.size };
  });
  const after = await until(() => sup.evaluate(() => document.querySelector("input[type=file][name=photos]").files[0]?.size ?? 0), "фото сжато");
  assert.ok(sizes.before > 2 * 1024 * 1024, `исходное фото должно быть большим: ${sizes.before}`);
  assert.ok(after <= 1024 * 1024, `после сжатия ${after} байт`);
  log(`фото: ${(sizes.before / 1048576).toFixed(1)} МБ → ${(after / 1024).toFixed(0)} КБ`);
  await sup.locator("[name=unitPrice]:visible").first().fill("9000");
  await sup.locator("[name=unitQty]:visible").first().fill("30");
  await shot(sup, "product-new", { fullPage: true });
  await sup.locator("form", { has: sup.locator("[name=name]:visible") }).locator("button[type=submit]").last().click();
  await sup.waitForURL(/\/supplier\/catalog\/[^/]+\?created=1/, { timeout: 20000 });
  const [sku, photo] = sql(`SELECT sku || '|' || "photoPaths"[1] FROM "Product" WHERE name = 'Вафли ${sfx}'`).split("|");
  assert.match(sku, /^A-\d{5}$/, "артикул присвоен автоматически");
  const stored = statSync(path.join(process.env.UPLOAD_DIR ?? "./storage/uploads", photo)).size;
  assert.ok(stored <= 1024 * 1024, `на сервере фото ${stored} байт`);
  assert.equal(await sup.locator("[name=sku]:visible").count(), 0);
  assert.ok((await sup.locator("[data-testid=sku-readonly]:visible").innerText()).includes(sku), "артикул показан только для чтения");
  log(`артикул ${sku} присвоен автоматически, фото на сервере ${(stored / 1024).toFixed(0)} КБ`);
}

// ───── Магазин: 13. подгрузка по 10, 5. ввод количества, 6. поиск поставщиков, 10. корзина ─────
const shop = await phone(shopPhone, "shop12345", "/shop");
const cards = (page) => page.locator("[data-testid=stepper-qty], button[aria-label^='" + L("Добавить в корзину", "Savatga qoʻshish") + "']");
{
  await shop.goto(`${BASE}/shop`);
  const feed = shop.locator("main .grid.grid-cols-2 > div");
  await feed.first().waitFor();
  await shop.locator("[data-testid=load-more]:visible").waitFor({ state: "attached" });
  await until(async () => (await feed.count()) >= 10, "лента загрузилась");
  assert.equal(await feed.count(), 10, "в ленте сначала 10 карточек");
  await shop.locator("[data-testid=load-more]:visible").scrollIntoViewIfNeeded();
  await until(async () => (await feed.count()) === 20, "подгрузились ещё 10");
  await shop.locator("[data-testid=load-more]:visible").scrollIntoViewIfNeeded();
  await until(async () => (await feed.count()) >= 28, "подгрузились все");
  log(`лента: 10 → 20 → ${await feed.count()} карточек при прокрутке`);

  await shop.goto(`${BASE}/shop/suppliers/${supplierId}`);
  const rows = shop.locator("main .grid.gap-2\\.5 > div");
  await rows.first().waitFor();
  await until(async () => (await rows.count()) >= 10, "каталог загрузился");
  assert.equal(await rows.count(), 10, "в каталоге поставщика сначала 10 товаров");
  await shop.locator("[data-testid=load-more]:visible").scrollIntoViewIfNeeded();
  await until(async () => (await rows.count()) === 20, "каталог: ещё 10");
  assert.match(shop.url(), /n=20/);
  log("каталог поставщика: 10 → 20 при прокрутке");

  // Количество с клавиатуры
  await shop.goto(`${BASE}/shop/suppliers/${supplierId}?q=${encodeURIComponent(`Лимонад 01 ${sfx}`)}`);
  const unit = `fx-u-${sfx}-a1`;
  const inCart = () => sql(`SELECT COALESCE((SELECT qty::int FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" WHERE o.status = 'DRAFT' AND o."shopId" = '${shopId}' AND i."productUnitId" = '${unit}'), 0)`);
  await shop.locator(`button[aria-label^="${L("Добавить в корзину", "Savatga qoʻshish")}"]`).first().click();
  const qty = shop.locator("[data-testid=stepper-qty]:visible").first();
  await qty.waitFor();
  await until(() => inCart() === "1", "товар в корзине");
  assert.equal(await qty.getAttribute("inputmode"), "numeric", "цифровая клавиатура");
  await qty.click();
  await qty.pressSequentially("1a7.б");
  assert.equal(await qty.inputValue(), "17", "вводятся только цифры");
  await shot(shop, "qty-input");
  await qty.press("Enter");
  await until(() => inCart() === "17", "количество 17 сохранено");
  await until(async () => (await qty.inputValue()) === "17", "в счётчике 17");
  // Больше остатка — урезается до остатка
  await qty.click();
  await qty.pressSequentially("999");
  await qty.press("Enter");
  await until(() => inCart() === "50", "количество урезано до остатка 50");
  await until(async () => (await qty.inputValue()) === "50", "в счётчике 50");
  await shop.getByText(L("Доступно только 50", "Faqat 50")).first().waitFor();
  log("количество с клавиатуры: 17 сохранено, 999 урезано до остатка 50");
  // «−» по-прежнему работает
  await shop.locator(`button[aria-label^="${L("Убрать одну", "Bittaga kamaytirish")}"]`).first().click();
  await until(() => inCart() === "49", "минус работает");

  // Поиск поставщиков
  await shop.goto(`${BASE}/shop/suppliers`);
  const search = shop.locator("input[type=search][enterkeyhint=search]");
  await search.waitFor();
  const links = shop.locator(`main a[href^="/shop/suppliers/"]`);
  assert.ok((await links.count()) >= 2);
  await search.fill("фруктовый");
  await until(async () => (await links.count()) === 1, "найден один поставщик");
  assert.ok((await links.first().innerText()).includes(otherName));
  await shot(shop, "supplier-search");
  await search.fill("zzzz нет такого");
  await shop.getByText(L("Ничего не найдено", "Hech narsa topilmadi")).waitFor();
  await search.fill("");
  await until(async () => (await links.count()) >= 2, "поиск сброшен");
  log("поиск поставщиков работает");
}

// Корзина: 3 товара у первого поставщика, 2 у второго
const cartIds = () => sqlAll(`SELECT i.id || '|' || i."productName" || '|' || o."supplierId" FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" WHERE o.status = 'DRAFT' AND o."shopId" = '${shopId}' ORDER BY i."createdAt"`).split("\n").filter(Boolean).map((r) => r.split("|"));
let placedOrderId = "";
{
  const put = (sid, key, qty) =>
    sql(
      `WITH o AS (INSERT INTO "Order" (id, "shopId", "supplierId", "updatedAt") VALUES ('fx-o-${sfx}-${sid.slice(-4)}', '${shopId}', '${sid}', now()) ON CONFLICT DO NOTHING RETURNING id)
       INSERT INTO "OrderItem" (id, "orderId", "productUnitId", "productName", "unitLabel", price, qty)
       SELECT 'fx-i-${sfx}-${key}', (SELECT id FROM "Order" WHERE status = 'DRAFT' AND "shopId" = '${shopId}' AND "supplierId" = '${sid}' UNION ALL SELECT id FROM o LIMIT 1), u.id, p.name, 'шт.', u.price, ${qty}
       FROM "ProductUnit" u JOIN "Product" p ON p.id = u."productId" WHERE u.id = 'fx-u-${sfx}-${key}' RETURNING id`,
    );
  // у первого поставщика корзина уже есть (Лимонад 01 × 49)
  put(supplierId, "a2", 2);
  put(supplierId, "a3", 3);
  put(otherId, "b1", 1);
  put(otherId, "b2", 2);
  sql(`UPDATE "Order" o SET total = (SELECT SUM(price * qty) FROM "OrderItem" WHERE "orderId" = o.id) WHERE status = 'DRAFT' AND "shopId" = '${shopId}'`);
  assert.equal(cartIds().length, 5);

  await shop.goto(`${BASE}/shop/cart`);
  const checks = shop.locator("[data-testid=cart-item-check]:visible");
  await checks.first().waitFor();
  assert.equal(await checks.count(), 5);
  const bar = shop.locator("[data-testid=cart-total-bar]:visible");
  const num = async () => Number((await bar.innerText()).replace(/[^\d]/g, "").replace(/^2/, "")); // «поставщиков: 2» в начале
  const all = 49 * 5100 + 2 * 5200 + 3 * 5300 + 12000 + 2 * 15000;
  assert.ok((await bar.innerText()).replace(/\s/g, "").includes(String(all)), `итог по всем: ${all}`);
  // Снимаем «Груши» и «Лимонад 03»: сумма пересчитывается, «Выбрано 3 из 5»
  await shop.locator("label", { hasText: `Груши ${sfx}` }).locator("input").uncheck();
  await shop.locator("label", { hasText: `Лимонад 03 ${sfx}` }).locator("input").uncheck();
  const picked = all - 2 * 15000 - 3 * 5300;
  await until(async () => (await bar.innerText()).replace(/\s/g, "").includes(String(picked)), "сумма по отмеченным");
  assert.ok((await bar.innerText()).includes(L("Выбрано 3 из 5", "5 tadan 3 tasi")), await bar.innerText());
  await shot(shop, "cart-selected", { fullPage: true });
  void num;
  // «Выбрать все» снимает и ставит все галочки
  const allBox = shop.locator("[data-testid=cart-select-all]:visible");
  await allBox.check();
  assert.equal(await shop.locator("[data-testid=cart-item-check]:visible:checked").count(), 5);
  await allBox.uncheck();
  assert.equal(await shop.locator("[data-testid=cart-item-check]:visible:checked").count(), 0);
  assert.ok(await shop.locator("[data-testid=cart-delete]:visible").isDisabled(), "нечего удалять");
  assert.equal(await shop.locator("[data-testid=cart-checkout]:visible").count(), 0, "нечего оформлять");
  // Удалить выбранные: только «Лимонад 03»
  await shop.locator("label", { hasText: `Лимонад 03 ${sfx}` }).locator("input").check();
  await shop.locator("[data-testid=cart-delete]:visible").click();
  await shot(shop, "cart-delete-confirm");
  await shop.locator("[data-testid=cart-delete-yes]:visible").click();
  await until(() => cartIds().length === 4, "позиция удалена");
  assert.ok(!cartIds().some((r) => r[1].startsWith("Лимонад 03")));
  await until(async () => (await checks.count()) === 4, "список обновился");
  log("корзина: выбор, «Выбрать все» и «Удалить выбранные» работают");

  // Оформляем выбранное у двух поставщиков одной кнопкой: «Лимонад 02» и «Яблоки»; остальное остаётся
  await allBox.uncheck();
  await shop.locator("label", { hasText: `Лимонад 02 ${sfx}` }).locator("input").check();
  await shop.locator("label", { hasText: `Яблоки ${sfx}` }).locator("input").check();
  await shop.locator("[data-testid=cart-checkout]:visible").click();
  const form = shop.locator("#checkout-all form");
  await form.waitFor();
  if (lang === "uz") assert.equal((await form.locator("option[value=CARD]").innerText()).trim(), "Karta orqali", "«Карта» оплаты переведена верно");
  else assert.equal((await form.locator("option[value=CARD]").innerText()).trim(), "Банковская карта");
  await form.locator("[name=paymentMethod]:visible").selectOption("CARD");
  await form.locator("[name=comment]:visible").fill("Позвоните за час до доставки, вход со двора");
  await shot(shop, "cart-checkout-form", { fullPage: true });
  await form.locator("button[type=submit]").click();
  await shop.waitForURL(/\/shop\/orders\?placed=2/, { timeout: 20000 });
  const left = cartIds();
  assert.deepEqual(left.map((r) => r[1].replace(` ${sfx}`, "")).sort(), ["Груши", "Лимонад 01"], "неотмеченное осталось в корзине");
  placedOrderId = sql(`SELECT o.id FROM "Order" o JOIN "OrderItem" i ON i."orderId" = o.id WHERE o."shopId" = '${shopId}' AND o."supplierId" = '${supplierId}' AND o.status = 'PLACED' AND i."productName" = 'Лимонад 02 ${sfx}'`);
  assert.ok(placedOrderId, "заказ с отмеченным товаром оформлен");
  assert.equal(sql(`SELECT count(*) || '/' || "paymentMethod" FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" WHERE o.id = '${placedOrderId}' GROUP BY "paymentMethod"`), "1/CARD");
  log("оформлены только отмеченные товары (2 заказа), остальные остались в корзине");

  // Один поставщик, часть товаров → страница корзины поставщика с датой и пометкой «оформляются выбранные»
  sql(`INSERT INTO "OrderItem" (id, "orderId", "productUnitId", "productName", "unitLabel", price, qty) SELECT 'fx-i-${sfx}-a4', o.id, u.id, p.name, 'шт.', u.price, 4 FROM "Order" o, "ProductUnit" u JOIN "Product" p ON p.id = u."productId" WHERE o.status = 'DRAFT' AND o."shopId" = '${shopId}' AND o."supplierId" = '${supplierId}' AND u.id = 'fx-u-${sfx}-a4' RETURNING id`);
  await shop.goto(`${BASE}/shop/cart`);
  await allBox.uncheck();
  await shop.locator("label", { hasText: `Лимонад 04 ${sfx}` }).locator("input").check();
  await shop.locator("[data-testid=cart-checkout]:visible").click();
  await shop.waitForURL(/\/shop\/cart\/[^?]+\?items=/, { timeout: 15000 });
  await shop.getByText(L("Оформляются выбранные товары: 1 из 2", "2 tadan 1 tasi")).waitFor();
  await shop.locator("form:has([name=deliveryAddress]:visible) button[type=submit]").click();
  await shop.waitForURL(/\/shop\/orders\/[^?]+\?placed=1/, { timeout: 20000 });
  assert.deepEqual(cartIds().map((r) => r[1].replace(` ${sfx}`, "")).sort(), ["Груши", "Лимонад 01"]);
  log("оформление части корзины одного поставщика работает");
}

// ───── 7–8. Комментарий и принудительная продажа у поставщика, магазина и доставщика; 9. предупреждения у кнопки ─────
{
  await sup.goto(`${BASE}/supplier/orders/${placedOrderId}`);
  const comment = sup.locator("[data-testid=order-comment]:visible");
  await comment.waitFor();
  assert.ok((await comment.innerText()).includes("Позвоните за час"));
  const accept = sup.locator("main form button").first();
  const [cb, ab] = [await comment.boundingBox(), await accept.boundingBox()];
  assert.ok(cb.y + cb.height <= ab.y, "комментарий выше кнопки «Принять заказ»");
  assert.ok(cb.y < 400, `комментарий виден сразу: y=${cb.y}`);
  await shot(sup, "supplier-order-comment");
  // Принудительная продажа
  const forced = sup.locator("form:has([name=unitId]:visible)");
  await forced.locator("[name=unitId]:visible").selectOption(`fx-u-${sfx}-a5`);
  await forced.locator("[name=qty]:visible").fill("3");
  await forced.locator("button[type=submit]").click();
  const notice = sup.locator("[data-testid=forced-notice]:visible");
  await notice.waitFor({ timeout: 15000 });
  assert.ok((await notice.innerText()).includes(`Лимонад 05 ${sfx}`));
  await sup.evaluate(() => window.scrollTo(0, 0));
  await shot(sup, "supplier-order-forced", { fullPage: true });
  await sup.goto(`${BASE}/supplier/orders?status=PLACED`);
  const row = sup.locator(`a[href="/supplier/orders/${placedOrderId}"]`);
  await row.locator("[data-testid=order-flags]:visible").waitFor();
  assert.ok((await row.innerText()).includes(L("Принудительная продажа", "Majburiy sotuv")));
  assert.ok((await row.innerText()).includes("Позвоните за час"));
  await shot(sup, "supplier-orders-flags");
  log("поставщик: комментарий наверху заказа, принудительная продажа видна в заказе и в списке");

  await shop.goto(`${BASE}/shop/orders/${placedOrderId}`);
  await shop.locator("[data-testid=forced-notice]:visible").waitFor();
  await shot(shop, "shop-order-forced", { fullPage: true });
  await shop.goto(`${BASE}/shop/orders`);
  await shop.locator("[data-testid=order-forced]:visible").first().waitFor();
  await shot(shop, "shop-orders-forced");
  log("магазин: принудительная продажа видна в заказе и в списке");

  // Доставка: поставщик везёт сам; магазину работа в долг не разрешена
  sql(`UPDATE "Order" SET status = 'IN_TRANSIT', "courierId" = '${supplierUser}', "acceptedAt" = now(), "assignedAt" = now(), "inTransitAt" = now() WHERE id = '${placedOrderId}'`);
  sql(`INSERT INTO "ShopAccount" (id, "shopId", "supplierId", "creditAllowed", "updatedAt") VALUES ('fx-acc-${sfx}', '${shopId}', '${supplierId}', false, now()) ON CONFLICT ("shopId", "supplierId") DO UPDATE SET "creditAllowed" = false RETURNING id`);
  await sup.goto(`${BASE}/courier/orders/${placedOrderId}`);
  await sup.locator("[data-testid=order-comment]:visible").waitFor();
  await sup.locator("[data-testid=forced-notice]:visible").waitFor();
  const cy = (await sup.locator("[data-testid=order-comment]:visible").boundingBox()).y;
  assert.ok(cy < 420, `комментарий у доставщика наверху: y=${cy}`);
  await shot(sup, "courier-order-top");
  const submit = sup.locator("form:has([name=received]:visible) button[type=submit]").last();
  const warn = sup.locator("[data-testid=accept-warnings]:visible");
  await submit.scrollIntoViewIfNeeded();
  assert.ok((await warn.innerText()).includes(L("не разрешена работа в долг", "nasiyaga ishlashga ruxsat berilmagan")), "предупреждение о долге стоит у кнопки");
  await sup.locator("[name=received]:visible").fill("1000");
  await sup.getByText(L("Получено меньше, чем нужно", "Kerakligidan kam olindi")).waitFor();
  await submit.scrollIntoViewIfNeeded();
  const [wb, sb] = [await warn.boundingBox(), await submit.boundingBox()];
  assert.ok(wb.y + wb.height <= sb.y + 1 && sb.y - (wb.y + wb.height) < 40, "предупреждения прямо над кнопкой");
  const vh = sup.viewportSize().height;
  assert.ok(wb.y >= 0 && sb.y + sb.height <= vh, "предупреждение и кнопка на одном экране");
  await shot(sup, "courier-warnings");
  // Ответ сервера тоже появляется у кнопки
  await sup.locator("[name=qr]:visible").fill("ABCDE12345");
  await submit.click();
  const msg = warn.locator("[data-form-message]");
  await msg.waitFor({ timeout: 15000 });
  const mb = await msg.boundingBox();
  assert.ok(mb.y >= 0 && mb.y + mb.height <= vh, "ответ сервера виден без прокрутки");
  await shot(sup, "courier-server-error");
  log(`доставщик: комментарий наверху, предупреждения и ответ сервера у кнопки («${(await msg.innerText()).slice(0, 60)}»)`);
}

// ───── 12. Журнал склада и чек на узких экранах ─────
{
  const unitId = sql(`SELECT m."productUnitId" FROM "StockMovement" m JOIN "ProductUnit" u ON u.id = m."productUnitId" JOIN "Product" p ON p.id = u."productId" WHERE p."supplierId" = '${supplierId}' AND m."userId" IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC`);
  const receiptOrder = sql(`SELECT id FROM "Order" WHERE "supplierId" = '${supplierId}' AND status IN ('COMPLETED', 'PARTIALLY_ACCEPTED') ORDER BY "completedAt" DESC`);
  for (const width of [360, 390, 430]) {
    const page = await phone(supplierPhone, "supplier123", "/supplier", width);
    await page.goto(`${BASE}/supplier/stock/${unitId}`);
    await page.locator("table.stack-table tbody tr").first().waitFor();
    // В каждой карточке ячейки начинаются от одного левого края, подписи не уезжают «лесенкой»
    const bad = await page.evaluate(() => {
      const out = [];
      for (const tr of document.querySelectorAll("table.stack-table tbody tr")) {
        const cells = [...tr.querySelectorAll("td")].filter((td) => td.offsetParent !== null);
        const lefts = new Set(cells.map((td) => Math.round(td.getBoundingClientRect().left)));
        const widths = new Set(cells.map((td) => Math.round(td.getBoundingClientRect().width)));
        if (lefts.size !== 1 || widths.size !== 1) out.push(`лесенка: ${[...lefts]} / ${[...widths]}`);
        for (const td of cells) if (td.dataset.label && !td.classList.contains("stack-wide") && td.getBoundingClientRect().height > 40) out.push(`высокая ячейка «${td.dataset.label}»: ${td.getBoundingClientRect().height}`);
        if (/\bOrder c[a-z0-9]{20,}/.test(tr.innerText)) out.push("виден технический номер записи");
      }
      if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push("горизонтальная прокрутка страницы");
      return out;
    });
    assert.deepEqual(bad, [], `журнал склада на ${width}px`);
    await shot(page, `stock-journal-${width}`, { fullPage: true });
    for (const doc of ["receipt", "invoice"]) {
      await page.goto(`${BASE}/documents/orders/${receiptOrder}/${doc}`);
      await page.locator("h1").waitFor();
      const overflow = await page.evaluate(() => {
        const out = [];
        if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push(`страница шире экрана: ${document.documentElement.scrollWidth}`);
        for (const el of document.querySelectorAll("main td, main th, main dd, main dt")) {
          const r = el.getBoundingClientRect();
          if (r.right > window.innerWidth + 1) out.push(`за краем: ${el.textContent.slice(0, 20)}`);
        }
        return out.slice(0, 5);
      });
      assert.deepEqual(overflow, [], `${doc} на ${width}px`);
      await shot(page, `${doc}-${width}`, { fullPage: true });
    }
    await page.context().close();
  }
  log("журнал склада, чек и накладная ровные на 360, 390 и 430 px");
}

// ───── 15. Минимальное количество товара в заказе ─────
{
  await sup.goto(`${BASE}/supplier/catalog/fx-p-${sfx}-a10`);
  const min = sup.locator("[name=existingMin]:visible").first();
  await min.scrollIntoViewIfNeeded();
  assert.equal(await min.inputValue(), "", "по умолчанию минимума нет");
  await min.fill("6");
  await shot(sup, "min-qty-supplier");
  await sup.locator("form", { has: min }).locator("button[type=submit]").click();
  await until(() => sql(`SELECT "minOrderQty"::int FROM "ProductUnit" WHERE id = 'fx-u-${sfx}-a10'`) === "6", "минимум сохранён");

  const unit = `fx-u-${sfx}-a10`;
  const inCart = () => sql(`SELECT COALESCE((SELECT qty::int FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" WHERE o.status = 'DRAFT' AND o."shopId" = '${shopId}' AND i."productUnitId" = '${unit}'), 0)`);
  await shop.goto(`${BASE}/shop/suppliers/${supplierId}?q=${encodeURIComponent(`Лимонад 10 ${sfx}`)}`);
  await shop.locator("[data-testid=min-qty]:visible").first().waitFor();
  await shop.locator(`button[aria-label^="${L("Добавить в корзину", "Savatga qoʻshish")}"]:visible`).first().click();
  await until(() => inCart() === "6", "«+» кладёт сразу минимум");
  const qty = shop.locator("[data-testid=stepper-qty]:visible").first();
  await until(async () => (await qty.inputValue()) === "6", "в счётчике 6");
  // Меньше минимума с клавиатуры не ставится
  await qty.click();
  await qty.pressSequentially("2");
  await qty.press("Enter");
  await shop.getByText(L("Минимум для заказа: 6", "Buyurtma uchun minimum: 6")).first().waitFor();
  assert.equal(inCart(), "6");
  await shot(shop, "min-qty-shop");
  // «−» на минимуме убирает товар
  await shop.locator(`button[aria-label^="${L("Убрать одну", "Bittaga kamaytirish")}"]:visible`).first().click();
  await until(() => inCart() === "0", "«−» на минимуме убирает позицию");
  // 0 снова снимает минимум
  await sup.reload();
  const again = sup.locator("[name=existingMin]:visible").first();
  assert.equal(await again.inputValue(), "6");
  await again.fill("0");
  await sup.locator("form", { has: again }).locator("button[type=submit]").click();
  await until(() => sql(`SELECT "minOrderQty"::int FROM "ProductUnit" WHERE id = 'fx-u-${sfx}-a10'`) === "0", "минимум снят");
  log("минимальное количество: поставщик задаёт, магазин не может заказать меньше, 0 снимает минимум");
}

await browser.close();
// Убираем за собой: тестовый поставщик и условия не мешают следующим сценариям
sql(`UPDATE "Supplier" SET status = 'BLOCKED', "hiddenFromShops" = true WHERE id = '${otherId}'`);
sql(`DELETE FROM "Order" WHERE status = 'DRAFT' AND "shopId" = '${shopId}'`);
console.log(`mobile-fixes ${lang} ok`);

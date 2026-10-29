// Требования App Store / Google Play на телефоне: политика конфиденциальности без входа,
// ссылка на неё при регистрации, удаление аккаунта в приложении. Запуск на работающем сервере:
// CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/e2e/mobile-compliance.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_OUT ?? "/tmp";
const PHONE = `+99897${String(Date.now()).slice(-7)}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = () =>
  browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: 41.31, longitude: 69.28 },
    permissions: ["geolocation"],
    // Как в приложении (capacitor.config.ts → appendUserAgent)
    userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 B2BOrdersApp/1",
  });
const log = (...a) => console.log("•", ...a);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

async function register(page) {
  await page.goto(`${BASE}/register/shop`);
  await page.locator("[name=fullName]").fill("Проверка Удаления");
  await page.getByLabel("Телефон для входа").fill(PHONE);
  await page.locator("[name=password]:visible").fill("shop12345");
  await page.getByLabel("Повторите пароль").fill("shop12345");
  await page.locator("[name=name]").fill("Магазин для удаления");
  await page.getByLabel("Регион").selectOption({ label: "г. Ташкент" });
  await page.getByLabel("Город или район").selectOption({ label: "Мирабадский район" });
  await page.locator("[name=address]").fill("Ташкент, ул. Проверочная, 1");
  await page.getByRole("button", { name: /Моё местоположение/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Зарегистрировать магазин" }).click();
  await page.waitForURL(`${BASE}/shop`, { timeout: 15000, waitUntil: "commit" });
}

const page = await (await ctx()).newPage();

// 1. Политика и страница удаления открываются без входа, на обоих языках
for (const path of ["/privacy", "/account-deletion"]) {
  const res = await page.goto(`${BASE}${path}`);
  assert.equal(res.status(), 200, path);
  assert.ok(!page.url().includes("/login"), `${path} требует входа`);
}
await page.goto(`${BASE}/privacy`);
await page.getByRole("heading", { name: "Политика конфиденциальности" }).waitFor({ timeout: 10000 });
await shot(page, "m1-privacy");
await page.context().addCookies([{ name: "lang", value: "uz", url: BASE }]);
await page.goto(`${BASE}/privacy`);
await page.getByRole("heading", { name: "Maxfiylik siyosati" }).waitFor({ timeout: 10000 });
log("политика на узбекском: ok");
await page.context().clearCookies();

// 2. На входе и при регистрации есть ссылка на политику
await page.goto(`${BASE}/login`);
await page.getByRole("link", { name: "Политика конфиденциальности" }).waitFor({ timeout: 10000 });
await page.goto(`${BASE}/register/shop`);
await page.getByRole("link", { name: "политикой конфиденциальности" }).waitFor({ timeout: 10000 });

// 3. Удаление аккаунта из профиля
await register(page);
await page.goto(`${BASE}/account`);
await page.getByRole("link", { name: "Удалить аккаунт" }).click();
await page.waitForURL(/\/account\/delete/);
const warn = await page.getByText("единственный владелец магазина").count();
log("предупреждение владельцу магазина:", warn > 0);
assert.ok(warn > 0);
await shot(page, "m2-delete");
await page.locator("[name=password]:visible").fill("wrong-password");
await page.locator("[name=confirm]:visible").check();
await page.getByRole("button", { name: "Удалить аккаунт навсегда" }).click();
await page.getByText("Неверный пароль").waitFor({ timeout: 10000 });
await page.locator("[name=password]:visible").fill("shop12345");
await page.getByRole("button", { name: "Удалить аккаунт навсегда" }).click();
await page.waitForURL(/\/account-deletion\?done=1/, { timeout: 15000, waitUntil: "commit" });
await page.getByText("Ваш аккаунт удалён").waitFor({ timeout: 10000 });
await shot(page, "m3-deleted");
log("после удаления:", page.url());

// 4. Старая сессия не работает, войти с прежним паролем нельзя
await page.goto(`${BASE}/shop`);
await page.waitForURL(/\/login/, { timeout: 15000, waitUntil: "commit" });
await page.getByLabel("Телефон").fill(PHONE);
await page.getByLabel("Пароль").fill("shop12345");
await page.getByRole("button", { name: "Войти" }).click();
await page.getByText("Неверный телефон или пароль").waitFor({ timeout: 10000 });
log("вход удалённого аккаунта отклонён");

// 5. Тот же телефон можно зарегистрировать заново
await register(page);
log("повторная регистрация с тем же телефоном: ok");

await browser.close();
console.log("OK");

// Сквозной сценарий этапа 1 на запущенном приложении: node tests/e2e/stage1-flow.mjs
// Нужен супер-админ +998900000000 с паролем superadmin-1 (или ADMIN_PW).
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_OUT ?? "/tmp";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const geo = { latitude: 41.2856, longitude: 69.2034 };

async function ctx(mobile = false) {
  return browser.newContext({
    geolocation: geo,
    permissions: ["geolocation"],
    ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }),
  });
}
const R = () => String(Math.floor(1000000 + Math.random() * 8999999));
const SUP_PHONE = "90" + R(), SHOP_PHONE = "97" + R(), FAR_PHONE = "91" + R(), COUR_PHONE = "93" + R(), INN = "3" + R() + "1";
const SUPNAME = "ООО «Ташкент Опт " + INN.slice(-3) + "»";
const log = (...a) => console.log("•", ...a);
async function shot(page, name) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); }
async function selectTerritory(page, region, local, prefix = "") {
  const selects = page.locator(`${prefix} select`);
  await page.locator(`${prefix}`).getByLabel("Регион").selectOption({ label: region });
  if (local) await page.locator(`${prefix}`).getByLabel("Город или район").selectOption({ label: local });
}

// 1. Поставщик подаёт заявку
const sup = await (await ctx()).newPage();
await sup.goto(`${BASE}/register/supplier`);
await sup.locator("[name=fullName]").fill("Алишер Каримов");
await sup.getByLabel("Телефон для входа").fill(SUP_PHONE);
await sup.locator("[name=password]").fill("supplier123");
await sup.getByLabel("Повторите пароль").fill("supplier123");
await sup.getByLabel("Название юридического лица").fill(SUPNAME);
await sup.locator("[name=inn]").fill(INN);
await sup.getByLabel("Телефон компании").fill("71 200 00 00");
await sup.locator("[name=email]").fill("opt@example.uz");
await sup.getByLabel("Юридический адрес").fill("Ташкент, ул. Навои, 1");
await sup.getByLabel("Описание деятельности").fill("Бакалея и напитки оптом");
await sup.getByLabel("Регион").selectOption({ label: "г. Ташкент" });
await sup.getByLabel("Город или район").selectOption({ label: "Мирабадский район" });
await sup.getByLabel("Адрес офиса").fill("ул. Амира Темура, 10");
await sup.getByRole("button", { name: /Моё местоположение/ }).click();
await sup.waitForTimeout(500);
// Сначала без территории доставки — должна быть ошибка
await sup.getByRole("button", { name: "Отправить заявку" }).click();
await sup.waitForTimeout(1500);
log("ошибка без территории:", await sup.getByText("Выберите хотя бы одну территорию доставки").locator("visible=true").count() > 0);
await sup.locator("label", { hasText: /^г\. Ташкент/ }).locator("xpath=..").locator("input[type=checkbox]").first().check();
await sup.locator("[name=password]").fill("supplier123");
await sup.getByLabel("Повторите пароль").fill("supplier123");
await shot(sup, "01-supplier-form");
await sup.getByRole("button", { name: "Отправить заявку" }).click();
await sup.waitForTimeout(3000);
await shot(sup, "02-supplier-pending");
await sup.waitForURL(`${BASE}/supplier`, { timeout: 15000, waitUntil: "commit" });
log("поставщик после заявки:", sup.url(), (await sup.locator("h1:visible").innerText()));

// 2. Супер-админ входит, меняет временный пароль и подтверждает
const admin = await (await ctx()).newPage();
await admin.goto(`${BASE}/login`);
await admin.getByLabel("Телефон").fill("+998900000000");
await admin.getByLabel("Пароль").fill(process.env.ADMIN_PW ?? "superadmin-1");
await admin.getByRole("button", { name: "Войти" }).click();
await admin.waitForTimeout(2000);
await admin.waitForURL(/account\/password|\/admin$/, { timeout: 15000, waitUntil: "commit" });
log("админ после входа:", admin.url());
if (admin.url().includes("account/password")) {
await admin.getByLabel("Текущий пароль").fill("admin12345");
await admin.locator("[name=password]:visible").fill("superadmin-1");
await admin.getByLabel("Повторите новый пароль").fill("superadmin-1");
await admin.getByRole("button", { name: "Сменить пароль" }).click();
}
await admin.waitForURL(`${BASE}/admin`, { timeout: 15000, waitUntil: "commit" });
await admin.waitForTimeout(800);
await shot(admin, "03-admin-dashboard");
await admin.goto(`${BASE}/admin/suppliers?status=PENDING`);
await admin.getByText(SUPNAME).click();
await admin.waitForURL(/admin\/suppliers\/.+/, { waitUntil: "commit" });
await admin.waitForTimeout(800);
await admin.getByRole("button", { name: "Подтвердить" }).click();
await admin.waitForTimeout(1500);
await shot(admin, "04-admin-approved");
log("статус после подтверждения:", await admin.getByText("Статус изменён").locator("visible=true").count() > 0 ? "OK" : "нет сообщения");

// 3. Поставщик видит уведомление и добавляет доставщика
await sup.goto(`${BASE}/supplier`);
await sup.waitForTimeout(800);
log("бейдж статуса поставщика:", await sup.getByText("Активен").locator("visible=true").count());
log("колокольчик:", await sup.getByLabel("Уведомления").innerText());
await sup.goto(`${BASE}/supplier/team`);
await sup.getByLabel("Роль").selectOption("COURIER");
await sup.getByLabel("ФИО").fill("Бобур Доставщик");
await sup.locator("[name=phone]").fill(COUR_PHONE);
await sup.getByRole("button", { name: "Добавить" }).click();
await sup.waitForTimeout(1500);
const msg = await sup.locator(".bg-green-50").innerText();
log("добавлен доставщик:", msg);
const temp = /пароль: (\w+)/.exec(msg)?.[1];
await shot(sup, "05-supplier-team");

// 4. Магазин в Чиланзаре регистрируется с телефона и видит поставщика
const shopCtx = await ctx(true);
const shop = await shopCtx.newPage();
await shop.goto(`${BASE}/register/shop`);
await shop.locator("[name=fullName]").fill("Дильноза Юсупова");
await shop.getByLabel("Телефон для входа").fill(SHOP_PHONE);
await shop.locator("[name=password]").fill("shop12345");
await shop.getByLabel("Повторите пароль").fill("shop12345");
await shop.locator("[name=name]").fill("Минимаркет «Чиланзар»");
await shop.getByLabel("Регион").selectOption({ label: "г. Ташкент" });
await shop.getByLabel("Город или район").selectOption({ label: "Чиланзарский район" });
await shop.locator("[name=address]").fill("Чиланзар, 9 квартал, д. 5");
await shop.getByRole("button", { name: /Моё местоположение/ }).click();
await shop.waitForTimeout(500);
await shot(shop, "06-shop-register-mobile");
await shop.getByRole("button", { name: "Зарегистрировать магазин" }).click();
await shop.waitForURL(`${BASE}/shop`, { timeout: 15000, waitUntil: "commit" });
await shop.waitForTimeout(1000);
await shot(shop, "07-shop-home-mobile");
log("магазин видит поставщика:", await shop.getByText(SUPNAME).locator("visible=true").count() > 0);

// 5. Магазин в Ургенче поставщика не видит
const far = await (await ctx(true)).newPage();
await far.goto(`${BASE}/register/shop`);
await far.locator("[name=fullName]").fill("Ойбек");
await far.getByLabel("Телефон для входа").fill(FAR_PHONE);
await far.locator("[name=password]").fill("shop12345");
await far.getByLabel("Повторите пароль").fill("shop12345");
await far.locator("[name=name]").fill("Ургенч Маркет");
await far.getByLabel("Регион").selectOption({ label: "Хорезмская область" });
await far.getByLabel("Город или район").selectOption({ label: "Ургенч" });
await far.locator("[name=address]").fill("Ургенч, ул. Аль-Хорезми, 3");
await far.getByRole("button", { name: /Моё местоположение/ }).click();
await far.waitForTimeout(500);
await far.getByRole("button", { name: "Зарегистрировать магазин" }).click();
await far.waitForURL(`${BASE}/shop`, { timeout: 15000, waitUntil: "commit" });
await far.waitForTimeout(800);
log("ургенчский магазин видит поставщика:", await far.getByText(SUPNAME).locator("visible=true").count() > 0);
// Прямая ссылка на чужого поставщика
const supplierId = admin.url().split("/").pop();
const r = await far.goto(`${BASE}/shop/suppliers/${supplierId}`);
await far.waitForTimeout(1500);
log("прямая ссылка на поставщика вне территории:", r.status(), JSON.stringify((await far.locator("body").innerText()).slice(0, 120)));

// 6. Доставщик входит по временному паролю
const cour = await (await ctx(true)).newPage();
await cour.goto(`${BASE}/login`);
await cour.getByLabel("Телефон").fill(COUR_PHONE);
await cour.getByLabel("Пароль").fill(temp);
await cour.getByRole("button", { name: "Войти" }).click();
await cour.waitForURL(/account\/password/, { timeout: 15000, waitUntil: "commit" });
await cour.getByLabel("Текущий пароль").fill(temp);
await cour.locator("[name=password]:visible").fill("courier123");
await cour.getByLabel("Повторите новый пароль").fill("courier123");
await cour.getByRole("button", { name: "Сменить пароль" }).click();
await cour.waitForURL(`${BASE}/courier`, { timeout: 15000, waitUntil: "commit" });
log("доставщик в кабинете:", cour.url());
const denied = await cour.goto(`${BASE}/admin`);
await cour.waitForTimeout(1500);
log("доставщик открывает /admin →", cour.url(), JSON.stringify((await cour.locator("body").innerText()).slice(0, 150)));

// 7. Админ действует от имени поставщика
await admin.goto(`${BASE}/admin/suppliers/${supplierId}`);
await admin.getByRole("button", { name: "Действовать от имени" }).first().click();
await admin.waitForURL(`${BASE}/supplier`, { timeout: 15000, waitUntil: "commit" });
await admin.waitForTimeout(800);
await shot(admin, "08-impersonation");
await admin.goto(`${BASE}/supplier/profile`);
await admin.getByLabel("Сайт").fill("https://opt.uz");
await admin.getByRole("button", { name: "Сохранить" }).click();
await admin.waitForTimeout(1500);
await admin.getByRole("button", { name: "Вернуться в админку" }).click();
await admin.waitForURL(/admin\/suppliers/);
await admin.goto(`${BASE}/admin/audit`);
await admin.waitForTimeout(800);
await shot(admin, "09-audit");
log("аудит 'от имени':", await admin.getByText(/от имени/).locator("visible=true").count());

// 8. Перебор пароля
const bf = await (await ctx()).newPage();
await bf.goto(`${BASE}/login`);
for (let i = 0; i < 6; i++) {
  await bf.getByLabel("Телефон").fill("+998901112233");
  await bf.getByLabel("Пароль").fill("wrong" + i);
  await bf.getByRole("button", { name: "Войти" }).click();
  await bf.waitForTimeout(700);
}
log("блок после перебора:", await bf.getByText("Слишком много неудачных попыток").locator("visible=true").count() > 0);

await browser.close();

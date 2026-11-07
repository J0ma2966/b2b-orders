// Сквозной сценарий (этапы 1–6) на запущенном приложении: node tests/e2e/flow.mjs
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
await shop.goto(`${BASE}/shop/suppliers`);
await shop.waitForTimeout(800);
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
await far.goto(`${BASE}/shop/suppliers`);
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
await admin.getByRole("button", { name: "Сохранить" }).first().click();
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

// ═════════ Этап 2: каталог и склад ═════════
const fs = await import("node:fs");
// маленькая картинка для фото товара
const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc000000301010018dd8db00000000049454e44ae426082", "hex");
fs.writeFileSync(`${OUT}/water.png`, png);

await sup.goto(`${BASE}/supplier/catalog/categories`);
await sup.locator("input[name=name]:visible").last().fill("Напитки");
await sup.getByRole("button", { name: "Добавить" }).click();
await sup.waitForTimeout(1200);
log("категория:", await sup.getByText("Добавлена категория «Напитки»").locator("visible=true").count() > 0);

await sup.goto(`${BASE}/supplier/catalog/new`);
await sup.locator("[name=name]:visible").fill("Вода питьевая 1 л");
await sup.getByLabel("Категория").selectOption({ label: "Напитки" });
await sup.getByLabel("Бренд").fill("Hydrolife");
await sup.getByLabel("Характеристики").fill("Объём: 1 л\nГаз: без газа");
await sup.locator("input[name=photos]").setInputFiles(`${OUT}/water.png`);
await sup.locator("[name=unitPrice]").first().fill("3 000");
await sup.locator("[name=unitQty]").first().fill("100");
await sup.getByRole("button", { name: "+ Единица" }).click();
await sup.locator("[name=unitKind]").nth(1).selectOption("BOX");
await sup.locator("[name=unitPrice]").nth(1).fill("70000");
await sup.locator("[name=unitQty]").nth(1).fill("5");
await shot(sup, "10-new-product");
await sup.getByRole("button", { name: "Создать товар" }).click();
await sup.waitForURL(/supplier\/catalog\/[^/]+\?created=1/, { timeout: 15000, waitUntil: "commit" });
await sup.waitForTimeout(1000);
const productUrl = sup.url().split("?")[0];
log("товар создан:", productUrl);

// списание больше остатка → ошибка
await sup.getByLabel("Операция").selectOption("WRITE_OFF");
await sup.locator("[name=qty]").fill("200");
await sup.locator("[name=reason]").fill("Бой");
await sup.getByRole("button", { name: "Провести" }).click();
await sup.waitForTimeout(1200);
log("списание сверх остатка:", await sup.getByText("Недостаточно доступного остатка").locator("visible=true").count() > 0);
await sup.getByLabel("Операция").selectOption("INCOME");
await sup.locator("[name=qty]").fill("50");
await sup.locator("[name=reason]").fill("Накладная 15");
await sup.getByRole("button", { name: "Провести" }).click();
await sup.waitForTimeout(1500);
log("приход:", await sup.getByText("Остаток обновлён").locator("visible=true").count() > 0, (await sup.getByText(/Доступно:/).first().innerText()));

// снижение цены 3000 → 1500
await sup.locator("[name=existingPrice]").first().fill("1500");
await sup.getByRole("button", { name: "Сохранить цены" }).click();
await sup.waitForTimeout(1500);
log("антифрод при снижении:", await sup.getByText(/отправлено на проверку/).locator("visible=true").count() > 0);
await shot(sup, "11-product-page");

await admin.goto(`${BASE}/admin/antifraud`);
await admin.waitForTimeout(1000);
await shot(admin, "12-antifraud");
log("антифрод у админа:", await admin.getByText("Вода питьевая 1 л").locator("visible=true").count() > 0);
await admin.getByRole("button", { name: "Отклонить и вернуть цену" }).first().click();
await admin.waitForTimeout(1500);
const afOk = await admin.getByText("Решение сохранено").locator("visible=true").count() > 0;
log("решение антифрода:", afOk ? "OK" : "ОШИБКА");
if (!afOk) process.exitCode = 1;

await sup.goto(`${BASE}/supplier/stock`);
await sup.waitForTimeout(800);
await shot(sup, "13-stock");

// магазин видит товар и цену 3 000
await shop.goto(`${BASE}/shop/suppliers/${supplierId}`);
await shop.waitForTimeout(1200);
await shot(shop, "14-shop-catalog-mobile");
const card = await shop.locator("a", { hasText: "Вода питьевая 1 л" }).locator("visible=true").first().innerText();
log("карточка в каталоге магазина:", JSON.stringify(card));

// лента товаров на главной: товары всех поставщиков, с подписью поставщика
await shop.goto(`${BASE}/shop`);
await shop.waitForTimeout(1200);
await shot(shop, "14b-shop-feed-mobile");
const feedOk = (await shop.locator("a", { hasText: "Вода питьевая 1 л" }).locator("visible=true").count()) > 0
  && (await shop.getByRole("link", { name: SUPNAME }).locator("visible=true").count()) > 0;
log("лента товаров на главной:", feedOk ? "OK" : "ОШИБКА");
if (!feedOk) process.exitCode = 1;
await shop.goto(`${BASE}/shop/search?q=${encodeURIComponent("вода")}`);
await shop.waitForTimeout(1000);
const searchOk = new URL(shop.url()).pathname === "/shop" && (await shop.locator("a", { hasText: "Вода питьевая 1 л" }).locator("visible=true").count()) > 0;
log("поиск в ленте:", searchOk ? "OK" : "ОШИБКА");
if (!searchOk) process.exitCode = 1;
await shop.goto(`${BASE}/shop/suppliers/${supplierId}`);
await shop.waitForTimeout(800);
await shop.locator("a", { hasText: "Вода питьевая 1 л" }).first().click();
await shop.waitForURL(/products\//, { waitUntil: "commit" });
await shop.waitForTimeout(1000);
await shot(shop, "15-shop-product-mobile");

// журнал склада
await sup.goto(productUrl);
await sup.getByText("Журнал склада →").first().click();
await sup.waitForURL(/supplier\/stock\//, { waitUntil: "commit" });
await sup.waitForTimeout(1000);
log("журнал:", (await sup.locator("tbody tr:visible").count()), "операций");

// ═════════ Этап 3: заказы ═════════
const visible = (page, text) => page.getByText(text).locator("visible=true");
const plusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// Бонусная акция 10 + 1
await sup.goto(`${BASE}/supplier/bonuses`);
await sup.getByLabel("Название акции").fill("10 + 1 на воду");
await sup.locator("[name=triggerUnitId]").selectOption({ label: "Вода питьевая 1 л — шт." });
await sup.locator("[name=giftUnitId]").selectOption({ label: "Вода питьевая 1 л — шт." });
await sup.locator("[name=endsAt]").fill(plusDays(30));
await sup.getByRole("button", { name: "Создать акцию" }).click();
await sup.waitForTimeout(1500);
log("акция создана:", await visible(sup, "Акция «10 + 1 на воду» создана").count() > 0);

// Магазин кладёт в корзину 12 штук и 1 коробку
await shop.locator("[name=qty]:visible").first().fill("12");
await shop.getByRole("button", { name: "В корзину" }).first().click();
await shop.waitForTimeout(1500);
log("в корзину:", await visible(shop, /Добавлено в корзину/).count() > 0);
await shop.locator("[name=qty]:visible").first().fill("1000");
await shop.getByRole("button", { name: "В корзину" }).first().click();
await shop.waitForTimeout(1500);
log("сверх остатка:", JSON.stringify(await shop.locator(".bg-red-50:visible, [role=status]:visible").first().innerText().catch(() => "")));
await shop.goto(`${BASE}/shop/cart/${supplierId}`);
await shop.waitForTimeout(1200);
log("подарок в корзине:", await visible(shop, /Подарки по акциям/).count() > 0);
await shot(shop, "16-shop-cart-mobile");
await shop.getByRole("button", { name: "Оформить заказ" }).click();
await shop.waitForURL(/shop\/orders\/[^/]+\?placed=1/, { timeout: 15000, waitUntil: "commit" });
await shop.waitForTimeout(1200);
const orderUrlShop = shop.url().split("?")[0];
const orderId = orderUrlShop.split("/").pop();
log("заказ оформлен:", await shop.locator("h1:visible").innerText(), "| бонус:", await visible(shop, "Бонус").count() > 0);
await shot(shop, "17-shop-order-placed-mobile");

// Поставщик: новый заказ, принять, собрать, принудительная продажа, готов, доставщик
await sup.goto(`${BASE}/supplier`);
await sup.waitForTimeout(800);
log("плитка новых заказов:", (await sup.locator("a[href='/supplier/orders?status=PLACED']").first().innerText()).replace(/\n/g, " "));
await sup.goto(`${BASE}/supplier/orders/${orderId}`);
await sup.waitForTimeout(1000);
for (const b of ["Принять заказ", "Начать сборку"]) {
  await sup.getByRole("button", { name: b }).click();
  await sup.waitForTimeout(1500);
}
log("статус после сборки:", await visible(sup, "Статус: Собирается").count() > 0);
await sup.locator("[name=unitId]").selectOption({ index: 2 });
await sup.locator("[name=qty]:visible").fill("1");
await sup.getByRole("button", { name: "Добавить как принудительную продажу" }).click();
await sup.waitForTimeout(1500);
log("принудительная продажа:", await visible(sup, "Позиция добавлена и зарезервирована").count() > 0);
await sup.getByRole("button", { name: "Готов к доставке" }).click();
await sup.waitForTimeout(1500);
await sup.locator("[name=courierId]").selectOption({ label: "Бобур Доставщик · в работе 0" });
await sup.getByRole("button", { name: "Назначить" }).click();
await sup.waitForTimeout(1500);
log("доставщик назначен:", await visible(sup, "Доставщик назначен").count() > 0);
await sup.reload();
await sup.waitForTimeout(1000);
await shot(sup, "18-supplier-order");
log("итог у поставщика:", JSON.stringify(await sup.locator("text=Итого").locator("xpath=..").first().innerText()));

// Доставщик видит карточку доставки
await cour.goto(`${BASE}/courier`);
await cour.waitForTimeout(1000);
await shot(cour, "19-courier-mobile");
log("у доставщика:", JSON.stringify((await cour.locator("main").innerText()).slice(0, 200)));

// Остатки: штуки 12 + 1 бонус в резерве, коробка 1
await sup.goto(`${BASE}/supplier/stock`);
await sup.waitForTimeout(800);
log("остатки:", JSON.stringify((await sup.locator("main").innerText()).slice(0, 400)));

// Магазин видит историю и уведомления
await shop.goto(orderUrlShop);
await shop.waitForTimeout(1000);
await shot(shop, "20-shop-order-history-mobile");
log("история у магазина:", JSON.stringify((await shop.locator("ol").first().innerText()).slice(0, 400)));

// Второй заказ магазин отменяет сам
await shop.goto(`${BASE}/shop/suppliers/${supplierId}/products/${productUrl.split("/").pop()}`);
await shop.waitForTimeout(800);
// вторая единица продажи (коробка): выбрать карточку, затем количество в нижней плашке
await shop.locator("section", { has: shop.getByRole("heading", { name: "Единица продажи" }) }).getByRole("button").nth(1).click();
await shop.locator("[name=qty]:visible").first().fill("2");
await shop.getByRole("button", { name: "В корзину" }).first().click();
await shop.waitForTimeout(1500);
await shop.goto(`${BASE}/shop/cart/${supplierId}`);
await shop.getByLabel("Способ оплаты").selectOption("TRANSFER");
await shop.getByRole("button", { name: "Оформить заказ" }).click();
await shop.waitForURL(/placed=1/, { timeout: 15000, waitUntil: "commit" });
await shop.waitForTimeout(800);
await shop.getByLabel("Причина отмены").fill("Ошиблись количеством");
shop.once("dialog", (d) => d.accept());
await shop.getByRole("button", { name: "Отменить заказ" }).click();
await shop.waitForTimeout(1500);
log("отмена магазином:", await visible(shop, /Вы отменили заказ/).count() > 0);
await sup.goto(`${BASE}/supplier/stock`);
await sup.waitForTimeout(800);
log("остатки после отмены:", JSON.stringify((await sup.locator("main").innerText()).slice(0, 400)));

await admin.goto(`${BASE}/admin/orders`);
await admin.waitForTimeout(800);
log("заказы у админа:", await admin.locator("main li:visible").count());
await admin.goto(`${BASE}/admin/orders/${orderId}`);
await admin.waitForTimeout(800);
await shot(admin, "21-admin-order");

// ═════════ Этап 4–6: доставка, QR, финансы, замены ═════════
const errText = async (page) => (await page.locator(".bg-red-50:visible").first().innerText().catch(() => "")).replace(/\n/g, " ");
await cour.goto(`${BASE}/courier/orders/${orderId}`);
await cour.waitForTimeout(1000);
await cour.getByRole("button", { name: /Выехал к магазину/ }).click();
await cour.waitForTimeout(1500);
await cour.reload();
await cour.waitForTimeout(1000);
await shot(cour, "22-courier-in-transit-mobile");

await shop.goto(orderUrlShop);
await shop.waitForTimeout(1000);
await shop.getByRole("button", { name: "Подтвердить получение" }).click();
await shop.waitForTimeout(500);
const code = (await shop.locator("p.font-mono:visible").innerText()).trim();
await shot(shop, "23-shop-qr-mobile");
log("код подтверждения у магазина:", code);

// неверный QR
const accFirst = cour.locator("input[name^=accepted_]").first();
await accFirst.fill("10");
await cour.locator("[name=received]").fill("50000");
await cour.locator("[name=qr]").fill("AAAAA BBBBB");
await cour.getByRole("button", { name: "Подтвердить получение" }).click();
await cour.waitForTimeout(1500);
log("чужой QR:", await errText(cour));
// недоплата без разрешения на долг
await cour.locator("input[name^=accepted_]").first().fill("10");
await cour.locator("[name=received]").fill("50000");
await cour.locator("[name=qr]").fill(code);
await cour.getByRole("button", { name: "Подтвердить получение" }).click();
await cour.waitForTimeout(1500);
log("недоплата без кредита:", await errText(cour));

// поставщик разрешает работу в долг
await sup.goto(`${BASE}/supplier/shops`);
await sup.waitForTimeout(800);
const shopHref = await sup.locator("a", { hasText: "Минимаркет «Чиланзар»" }).first().getAttribute("href");
await sup.goto(`${BASE}${shopHref}`);
await sup.waitForTimeout(800);
await sup.locator("[name=creditAllowed]").check();
await sup.locator("[name=creditLimit]").fill("200000");
await sup.getByRole("button", { name: "Сохранить" }).click();
await sup.waitForTimeout(1500);

await cour.locator("input[name^=accepted_]").first().fill("10");
await cour.locator("[name=received]").fill("50000");
await cour.locator("[name=qr]").fill(code);
await shot(cour, "24-courier-acceptance-mobile");
await cour.getByRole("button", { name: "Подтвердить получение" }).click();
await cour.waitForTimeout(2000);
log("приёмка:", JSON.stringify((await cour.locator("main").innerText()).slice(0, 200)));
// повтор того же QR
await cour.goto(`${BASE}/courier/history`);
await cour.waitForTimeout(800);
await shot(cour, "25-courier-history-mobile");

await shop.goto(orderUrlShop);
await shop.waitForTimeout(1000);
log("статус у магазина:", await visible(shop, "Частично принят").count() > 0);
await shot(shop, "26-shop-order-received-mobile");
await shop.goto(`${BASE}/documents/orders/${orderId}/receipt`);
await shop.waitForTimeout(800);
await shot(shop, "27-receipt-mobile");
await shop.goto(`${BASE}/documents/orders/${orderId}/invoice`);
await shop.waitForTimeout(800);
log("накладная:", JSON.stringify((await shop.locator("body").innerText()).slice(0, 160)));
await shop.goto(`${BASE}/shop/debts`);
await shop.waitForTimeout(800);
await shot(shop, "28-shop-debts-mobile");
log("долг у магазина:", JSON.stringify((await shop.locator("main").innerText()).slice(0, 200)));

// погашение долга
await sup.goto(`${BASE}${shopHref}`);
await sup.waitForTimeout(800);
const payForm = sup.locator("form", { has: sup.getByRole("button", { name: "Зарегистрировать погашение" }) });
await payForm.locator("[name=amount]").fill("20000");
await payForm.locator("[name=comment]").fill("Наличными в офисе");
await sup.getByRole("button", { name: "Зарегистрировать погашение" }).click();
await sup.waitForTimeout(1500);
await sup.reload();
await sup.waitForTimeout(800);
await shot(sup, "29-supplier-shop-debt");
log("долг после погашения:", JSON.stringify(await sup.locator("text=Задолженность").first().locator("xpath=..").innerText()));

// замена: магазин → поставщик → доставщик → возвращённые
await shop.goto(`${BASE}/shop/replacements/new?order=${orderId}`);
await shop.waitForTimeout(1000);
await shop.locator("[name=orderItemId]").selectOption({ index: 1 });
await shop.locator("[name=qty]").fill("2");
await shop.locator("[name=reason]").selectOption({ index: 1 });
await shop.locator("[name=comment]").fill("Две бутылки протекают");
await shop.locator("input[name=photos]").setInputFiles(`${OUT}/water.png`);
await shot(shop, "30-shop-replacement-form-mobile");
await shop.getByRole("button", { name: "Отправить заявку" }).click();
await shop.waitForURL(/replacements\?created=1/, { timeout: 15000, waitUntil: "commit" });
await shop.waitForTimeout(800);
log("заявка на замену:", JSON.stringify((await shop.locator("main").innerText()).slice(0, 160)));

await sup.goto(`${BASE}/supplier/replacements`);
await sup.waitForTimeout(800);
await sup.locator("main a", { hasText: "Вода питьевая" }).first().click();
await sup.waitForURL(/supplier\/replacements\/.+/, { waitUntil: "commit" });
await sup.waitForTimeout(800);
await sup.getByRole("button", { name: "Согласовать и зарезервировать" }).click();
await sup.waitForTimeout(1500);
await sup.reload();
await sup.waitForTimeout(800);
await sup.locator("[name=courierId]").selectOption({ label: "Бобур Доставщик" });
await sup.getByRole("button", { name: "Назначить" }).click();
await sup.waitForTimeout(1500);
await shot(sup, "31-supplier-replacement");

await cour.goto(`${BASE}/courier/replacements`);
await cour.waitForTimeout(800);
cour.once("dialog", (d) => d.accept());
await cour.getByRole("button", { name: "Передал новый, забрал старый" }).click();
await cour.waitForTimeout(1500);
log("замена выполнена:", JSON.stringify((await cour.locator("main").innerText()).slice(0, 160)));

await sup.goto(`${BASE}/supplier/returned`);
await sup.waitForTimeout(800);
await sup.getByLabel("Статус").first().selectOption("BACK_TO_STOCK");
await sup.getByRole("button", { name: "Сохранить" }).first().click();
await sup.waitForTimeout(1500);
await sup.reload();
await sup.waitForTimeout(800);
await shot(sup, "32-supplier-returned");
await sup.goto(`${BASE}/supplier/stock`);
await sup.waitForTimeout(800);
log("остатки после замены:", JSON.stringify((await sup.locator("main").innerText()).slice(0, 400)));

// ═════════ Поставщик-ИП развозит сам ═════════
const check = (name, ok) => {
  log(name, ok ? "OK" : "ОШИБКА");
  if (!ok) process.exitCode = 1;
};
await sup.goto(`${BASE}/supplier/delivery`);
await sup.waitForTimeout(1000);
check("новый поставщик сразу развозит сам:", (await visible(sup, "Открыть приложение доставки").count()) > 0);
await sup.getByRole("button", { name: "Не развожу сам" }).click();
await sup.waitForTimeout(1500);
check("выключил «Сам развожу»:", (await sup.getByRole("button", { name: "Сам развожу заказы" }).count()) > 0);
await sup.getByRole("button", { name: "Сам развожу заказы" }).click();
await sup.waitForTimeout(1500);
check("снова включил:", (await visible(sup, "Открыть приложение доставки").count()) > 0);
await shot(sup, "39-supplier-delivery");

await shop.goto(`${BASE}/shop/suppliers/${supplierId}/products/${productUrl.split("/").pop()}`);
await shop.waitForTimeout(800);
await shop.locator("[name=qty]:visible").first().fill("2");
await shop.getByRole("button", { name: "В корзину" }).first().click();
await shop.waitForTimeout(1500);
await shop.goto(`${BASE}/shop/cart/${supplierId}`);
await shop.getByRole("button", { name: "Оформить заказ" }).click();
await shop.waitForURL(/placed=1/, { timeout: 15000, waitUntil: "commit" });
const selfOrderUrl = shop.url().split("?")[0];
const selfOrderId = selfOrderUrl.split("/").pop();
await sup.goto(`${BASE}/supplier/orders/${selfOrderId}`);
await sup.waitForTimeout(1000);
for (const b of ["Принять заказ", "Начать сборку", "Готов к доставке"]) {
  await sup.getByRole("button", { name: b }).click();
  await sup.waitForTimeout(1500);
}
const meOption = await sup.locator("[name=courierId] option", { hasText: "Я сам" }).first().getAttribute("value");
check("«Я сам» в списке доставщиков:", !!meOption);
await sup.locator("[name=courierId]").selectOption(meOption);
await sup.getByRole("button", { name: "Назначить" }).click();
await sup.waitForTimeout(1500);
await sup.reload();
await sup.waitForTimeout(1000);
check("ссылка «Везу сам»:", (await visible(sup, /Везу сам/).count()) > 0);

// Тот же поставщик в дороге — с телефона, в приложении доставки
const selfCour = await (await ctx(true)).newPage();
await selfCour.goto(`${BASE}/login`);
await selfCour.getByLabel("Телефон").fill(SUP_PHONE);
await selfCour.getByLabel("Пароль").fill("supplier123");
await selfCour.getByRole("button", { name: "Войти" }).click();
await selfCour.waitForURL(/\/supplier/, { timeout: 15000, waitUntil: "commit" });
await selfCour.goto(`${BASE}/courier`);
await selfCour.waitForTimeout(1200);
check("поставщик видит свою доставку:", selfCour.url().endsWith("/courier") && (await selfCour.locator(`a[href='/courier/orders/${selfOrderId}']`).count()) > 0);
await shot(selfCour, "40-supplier-as-courier-mobile");
await selfCour.goto(`${BASE}/courier/orders/${selfOrderId}`);
await selfCour.waitForTimeout(1000);
await selfCour.getByRole("button", { name: /Выехал к магазину/ }).click();
await selfCour.waitForTimeout(1500);
await selfCour.reload();
await selfCour.waitForTimeout(1000);
await shop.goto(selfOrderUrl);
await shop.waitForTimeout(1000);
await shop.getByRole("button", { name: "Подтвердить получение" }).click();
await shop.waitForTimeout(500);
const selfCode = (await shop.locator("p.font-mono:visible").innerText()).trim();
await selfCour.locator("[name=received]").fill("10000");
await selfCour.locator("[name=qr]").fill(selfCode);
await selfCour.getByRole("button", { name: "Подтвердить получение" }).click();
await selfCour.waitForTimeout(2000);
log("приёмка поставщиком:", JSON.stringify((await selfCour.locator("main").innerText()).slice(0, 200)));
await shop.goto(selfOrderUrl);
await shop.waitForTimeout(1000);
check("магазин получил заказ от поставщика:", (await visible(shop, /Завершён|Частично принят/).count()) > 0);
await selfCour.goto(`${BASE}/courier/cash`);
await selfCour.waitForTimeout(800);
check("касса владельца без «сдать поставщику»:", (await visible(selfCour, "Наличными сегодня").count()) > 0 && (await visible(selfCour, /Сдайте наличные/).count()) === 0);
await selfCour.getByLabel("Кабинет поставщика").click();
await selfCour.waitForURL(/supplier\/delivery/, { timeout: 15000, waitUntil: "commit" });
check("из приложения доставки обратно в кабинет:", true);

// отчёты, карта, финансы
await sup.goto(`${BASE}/supplier/reports?period=month`);
await sup.waitForTimeout(1200);
await shot(sup, "33-supplier-reports");
log("оборот в отчёте:", JSON.stringify((await sup.locator("main").innerText()).slice(0, 300)));
await sup.goto(`${BASE}/supplier/map`);
await sup.waitForTimeout(2500);
await shot(sup, "34-supplier-map");
await sup.goto(`${BASE}/supplier/audit`);
await sup.waitForTimeout(800);
log("журнал поставщика:", await sup.locator("tbody tr:visible").count(), "записей");
await admin.goto(`${BASE}/admin/reports?period=month`);
await admin.waitForTimeout(1200);
await shot(admin, "35-admin-reports");
await admin.goto(`${BASE}/admin/commissions`);
await admin.waitForTimeout(1000);
await shot(admin, "36-admin-commissions");
log("комиссии:", JSON.stringify((await admin.locator("main").innerText()).slice(0, 300)));
await admin.goto(`${BASE}/admin/finance`);
await admin.waitForTimeout(1000);
await shot(admin, "37-admin-finance");
await admin.goto(`${BASE}/admin`);
await admin.waitForTimeout(1000);
await shot(admin, "38-admin-dashboard");

// удаление из каталога — магазин больше не видит
await sup.goto(productUrl);
sup.once("dialog", (d) => d.accept());
await sup.getByRole("button", { name: "Удалить из каталога" }).click();
await sup.waitForTimeout(1500);
await shop.goto(`${BASE}/shop/suppliers/${supplierId}`);
await shop.waitForTimeout(1000);
log("после удаления магазин видит товар:", await shop.getByText("Вода питьевая 1 л").locator("visible=true").count() > 0);

await browser.close();

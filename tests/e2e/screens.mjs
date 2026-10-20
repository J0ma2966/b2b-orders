// Снимки экранов ролей для проверки дизайна: DATABASE_URL=… node tests/e2e/screens.mjs shop|courier|supplier|admin [lang]
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_OUT ?? "/tmp";
const role = process.argv[2] ?? "shop";
const lang = process.argv[3] ?? "ru";
const db = process.env.DATABASE_URL.replace(/\?.*$/, "");
const sql = (q) => execFileSync("psql", [db, "-Atc", q], { encoding: "utf8" }).trim().split("\n")[0];

const ACC = {
  shop: [sql(`SELECT u.phone FROM "User" u JOIN "ShopMember" m ON m."userId" = u.id JOIN "Order" o ON o."shopId" = m."shopId" ORDER BY u."createdAt"`), "shop12345"],
  courier: [sql(`SELECT u.phone FROM "User" u JOIN "SupplierMember" m ON m."userId" = u.id WHERE m.role = 'COURIER' ORDER BY u."createdAt" DESC`), "courier123"],
  supplier: [sql(`SELECT u.phone FROM "User" u JOIN "SupplierMember" m ON m."userId" = u.id WHERE m.role = 'OWNER' ORDER BY u."createdAt" DESC`), "supplier123"],
  admin: ["+998900000000", process.env.ADMIN_PW ?? "superadmin-1"],
};
const supplierId = sql(`SELECT id FROM "Supplier" WHERE status = 'ACTIVE' ORDER BY "createdAt" DESC`);
const orderId = sql(`SELECT id FROM "Order" WHERE status <> 'DRAFT' ORDER BY (status = 'IN_TRANSIT') DESC, "placedAt" ASC`);
const PAGES = {
  shop: ["/shop", `/shop/suppliers/${supplierId}`, "/shop/search?q=вода", "/shop/cart", "/shop/orders", `/shop/orders/${orderId}`],
  courier: ["/courier", `/courier/orders/${orderId}`, "/courier/replacements", "/courier/history", "/account", "/courier/map"],
  supplier: ["/supplier", "/supplier/orders", `/supplier/orders/${orderId}`],
  admin: ["/admin", "/admin/suppliers"],
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const [device, opts] of [["desktop", { viewport: { width: 1280, height: 860 } }], ["mobile", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const ctx = await browser.newContext(opts);
  await ctx.addCookies([{ name: "lang", value: lang, url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator("[name=phone]").fill(ACC[role][0]);
  await page.locator("[name=password]").fill(ACC[role][1]);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  for (const [i, p] of PAGES[role].entries()) {
    await page.goto(BASE + p);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.locator("h1").first().waitFor({ timeout: 5000 }).catch(() => {});
    await page.screenshot({ path: `${OUT}/${role}-${device}-${i + 1}.png`, fullPage: device === "desktop" });
  }
  await ctx.close();
}
await browser.close();
console.log("ok");

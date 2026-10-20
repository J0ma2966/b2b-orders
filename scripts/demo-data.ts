// Демонстрационные данные для показа витрины и приложения доставщика:
// каталог с фото, корзина магазина и заказы в разных статусах.
// Запуск после сквозного сценария (нужны активный поставщик, его доставщик и магазин):
//   DATABASE_URL=… CHROMIUM_PATH=/opt/pw-browsers/chromium npx tsx scripts/demo-data.ts
// Повторный запуск ничего не дублирует. Не для рабочей базы.
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { chromium } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client";
import { randomInt } from "node:crypto";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
// Как в src/lib/qr-token.ts (тот модуль только для сервера приложения)
const generateQrToken = () => Array.from({ length: 10 }, () => "23456789ABCDEFGHJKMNPQRSTUVWXYZ"[randomInt(31)]).join("");
const UPLOADS = path.resolve(process.env.UPLOAD_DIR ?? "./storage/uploads");

type Demo = { sku: string; name: string; category: string; brand: string; emoji: string; bg: string; piece: number; box?: [number, number]; stock: number };
const PRODUCTS: Demo[] = [
  { sku: "DEMO-01", name: "Вода питьевая Hydrolife 1,5 л", category: "Напитки", brand: "Hydrolife", emoji: "💧", bg: "#d8ecf7", piece: 4500, box: [6, 25000], stock: 600 },
  { sku: "DEMO-02", name: "Сок яблочный 1 л", category: "Напитки", brand: "Bodom", emoji: "🧃", bg: "#fbe7c6", piece: 14000, box: [12, 160000], stock: 240 },
  { sku: "DEMO-03", name: "Чай чёрный листовой 250 г", category: "Напитки", brand: "Шифо", emoji: "🫖", bg: "#efe0d0", piece: 22000, box: [20, 420000], stock: 120 },
  { sku: "DEMO-04", name: "Газированный напиток 1 л", category: "Напитки", brand: "Nestle", emoji: "🥤", bg: "#f7d6d6", piece: 9000, box: [12, 102000], stock: 300 },
  { sku: "DEMO-05", name: "Рис девзира 1 кг", category: "Бакалея", brand: "Фергана", emoji: "🍚", bg: "#f1efe6", piece: 28000, box: [10, 270000], stock: 200 },
  { sku: "DEMO-06", name: "Масло подсолнечное 1 л", category: "Бакалея", brand: "Oltin Don", emoji: "🌻", bg: "#fbf0c2", piece: 21000, box: [15, 300000], stock: 150 },
  { sku: "DEMO-07", name: "Мука высший сорт 2 кг", category: "Бакалея", brand: "Дон", emoji: "🌾", bg: "#f3ead8", piece: 17000, stock: 180 },
  { sku: "DEMO-08", name: "Соль поваренная 1 кг", category: "Бакалея", brand: "Баскунчак", emoji: "🧂", bg: "#e7ecef", piece: 3500, box: [20, 65000], stock: 400 },
  { sku: "DEMO-09", name: "Печенье сахарное 400 г", category: "Сладости", brand: "Crafers", emoji: "🍪", bg: "#f5e1c8", piece: 11000, box: [16, 168000], stock: 160 },
  { sku: "DEMO-10", name: "Шоколад молочный 90 г", category: "Сладости", brand: "Alpen Gold", emoji: "🍫", bg: "#ead6cc", piece: 13000, box: [20, 250000], stock: 0 },
  { sku: "DEMO-11", name: "Средство для посуды 500 мл", category: "Бытовая химия", brand: "Fairy", emoji: "🧴", bg: "#dff3e4", piece: 16000, box: [12, 180000], stock: 90 },
  { sku: "DEMO-12", name: "Бумажные полотенца, 2 рулона", category: "Бытовая химия", brand: "Familia", emoji: "🧻", bg: "#eef0f5", piece: 12000, stock: 110 },
];

async function makePhotos() {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  await mkdir(path.join(UPLOADS, "products"), { recursive: true });
  const paths: Record<string, string> = {};
  for (const p of PRODUCTS) {
    const rel = `products/${p.sku.toLowerCase()}.png`;
    await page.setContent(
      `<body style="margin:0;display:grid;place-items:center;height:480px;background:${p.bg}"><span style="font-size:240px;line-height:1">${p.emoji}</span></body>`,
    );
    await writeFile(path.join(UPLOADS, rel), await page.screenshot());
    paths[p.sku] = rel;
  }
  await browser.close();
  return paths;
}

async function main() {
  const supplier = await db.supplier.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  if (!supplier) throw new Error("Нет активного поставщика: сначала запустите сквозной сценарий");
  const courier = await db.supplierMember.findFirst({ where: { supplierId: supplier.id, role: "COURIER", isActive: true }, include: { user: true } });
  const shop = await db.shop.findFirstOrThrow({ where: { orders: { some: { supplierId: supplier.id } } }, orderBy: { createdAt: "asc" } });
  const shopOwner = await db.shopMember.findFirstOrThrow({ where: { shopId: shop.id, role: "OWNER" }, include: { user: true } });

  if (courier) await demoReplacement(supplier.id, shop.id, courier.userId, shopOwner.userId);
  if (await db.product.findFirst({ where: { supplierId: supplier.id, sku: "DEMO-01" } })) {
    console.log("Демо-данные уже есть");
    return;
  }
  const photos = await makePhotos();
  const units = new Map<string, { id: string; price: number; name: string; label: string }[]>();
  for (const [i, p] of PRODUCTS.entries()) {
    const category = await db.category.upsert({
      where: { supplierId_name: { supplierId: supplier.id, name: p.category } },
      update: {},
      create: { supplierId: supplier.id, name: p.category, sortOrder: i },
    });
    const product = await db.product.create({
      data: {
        supplierId: supplier.id,
        categoryId: category.id,
        name: p.name,
        brand: p.brand,
        sku: p.sku,
        photoPaths: [photos[p.sku]],
        units: {
          create: [
            { kind: "PIECE", price: p.piece, physicalQty: p.stock, sortOrder: 0 },
            ...(p.box ? [{ kind: "BOX" as const, customName: "", price: p.box[1], physicalQty: Math.floor(p.stock / p.box[0] / 2), sortOrder: 1 }] : []),
          ],
        },
      },
      include: { units: { orderBy: { sortOrder: "asc" } } },
    });
    units.set(p.sku, product.units.map((u) => ({ id: u.id, price: Number(u.price), name: p.name, label: u.kind === "PIECE" ? "шт." : "коробка" })));
  }

  // Заказ с позициями и резервом; qty — по первой единице товара
  const order = async (status: "DRAFT" | "PLACED" | "ASSEMBLING" | "ASSIGNED" | "IN_TRANSIT", lines: [string, number, number?][], extra: object = {}) => {
    const items = lines.map(([sku, qty, unitIndex = 0]) => ({ ...units.get(sku)![unitIndex], qty }));
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const placed = status !== "DRAFT";
    const number = placed ? Number((await db.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_number_seq')`)[0].nextval) : null;
    await db.order.create({
      data: {
        supplierId: supplier.id,
        shopId: shop.id,
        status,
        number,
        total,
        createdByUserId: shopOwner.userId,
        ...(placed && {
          placedAt: new Date(Date.now() - 3600_000 * 5),
          paymentMethod: "CASH",
          deliveryAddress: shop.address,
          deliveryLat: shop.lat,
          deliveryLng: shop.lng,
          contactName: shop.contactName ?? shopOwner.user.fullName,
          contactPhone: shop.phone,
          qrToken: generateQrToken(),
          commissionRate: 3,
        }),
        ...extra,
        items: { create: items.map((i) => ({ productUnitId: i.id, productName: i.name, unitLabel: i.label, price: i.price, qty: i.qty })) },
      },
    });
    if (placed) for (const i of items) await db.productUnit.update({ where: { id: i.id }, data: { reservedQty: { increment: i.qty } } });
  };

  await order("DRAFT", [["DEMO-02", 6], ["DEMO-09", 10], ["DEMO-06", 2, 1]]);
  await order("PLACED", [["DEMO-05", 10], ["DEMO-08", 20]]);
  await order("ASSEMBLING", [["DEMO-01", 4, 1], ["DEMO-04", 12]], { acceptedAt: new Date(Date.now() - 3600_000 * 4) });
  if (courier) {
    const assigned = { courierId: courier.userId, acceptedAt: new Date(Date.now() - 3600_000 * 3), assignedAt: new Date(Date.now() - 3600_000 * 2) };
    await order("IN_TRANSIT", [["DEMO-03", 5], ["DEMO-11", 6], ["DEMO-12", 10]], { ...assigned, inTransitAt: new Date(Date.now() - 1800_000), comment: "Позвонить за 10 минут, вход со двора" });
    await order("ASSIGNED", [["DEMO-07", 8], ["DEMO-02", 1, 1]], { ...assigned, deliveryDate: new Date(new Date().toISOString().slice(0, 10)) });
  }
  console.log(`Готово: ${PRODUCTS.length} товаров у «${supplier.displayName}», корзина и заказы магазина «${shop.name}»${courier ? `, доставки для ${courier.user.fullName}` : ""}`);
}

// Задание доставщику: согласованная замена по уже полученному заказу (товар зарезервирован)
async function demoReplacement(supplierId: string, shopId: string, courierId: string, createdByUserId: string) {
  if (await db.replacement.findFirst({ where: { supplierId, courierId, status: "ASSIGNED" } })) return;
  const item = await db.orderItem.findFirst({ where: { acceptedQty: { gt: 0 }, order: { supplierId, shopId, status: { in: ["COMPLETED", "PARTIALLY_ACCEPTED"] } } } });
  if (!item) return;
  const now = Date.now();
  await db.replacement.create({
    data: {
      shopId, supplierId, orderId: item.orderId, orderItemId: item.id, productUnitId: item.productUnitId,
      productName: item.productName, unitLabel: item.unitLabel, qty: 1, reason: "Брак", comment: "Помята упаковка",
      photoPaths: [], videoPaths: [], status: "ASSIGNED", courierId, createdByUserId,
      decidedAt: new Date(now - 3600_000), assignedAt: new Date(now - 1800_000),
    },
  });
  await db.productUnit.update({ where: { id: item.productUnitId }, data: { reservedQty: { increment: 1 } } });
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });

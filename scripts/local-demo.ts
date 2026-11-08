// Тестовые учётные записи и каталог для проверки на своём компьютере и телефоне (docs/local-wifi.md):
// поставщик (сам развозит), его доставщик, магазин в Ташкенте и 12 товаров с остатками.
// Запуск после npm run db:seed:  npx tsx scripts/local-demo.ts
// Повторный запуск ничего не дублирует. Не для рабочей базы.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const PASSWORD = process.env.DEMO_PASSWORD || "demo12345";

const ACCOUNTS = {
  supplier: { phone: "+998901000001", fullName: "Азиз Каримов (поставщик)" },
  courier: { phone: "+998901000002", fullName: "Бахтиёр Юсупов (доставщик)" },
  shop: { phone: "+998901000003", fullName: "Дилноза Рахимова (магазин)" },
};

const PRODUCTS: { sku: string; name: string; category: string; brand: string; piece: number; box?: [number, number]; stock: number }[] = [
  { sku: "DEMO-01", name: "Вода питьевая 1,5 л", category: "Напитки", brand: "Hydrolife", piece: 4500, box: [6, 25000], stock: 600 },
  { sku: "DEMO-02", name: "Сок яблочный 1 л", category: "Напитки", brand: "Bodom", piece: 14000, box: [12, 160000], stock: 240 },
  { sku: "DEMO-03", name: "Чай чёрный листовой 250 г", category: "Напитки", brand: "Шифо", piece: 22000, stock: 120 },
  { sku: "DEMO-04", name: "Газированный напиток 1 л", category: "Напитки", brand: "Nestle", piece: 9000, box: [12, 102000], stock: 300 },
  { sku: "DEMO-05", name: "Рис девзира 1 кг", category: "Бакалея", brand: "Фергана", piece: 28000, box: [10, 270000], stock: 200 },
  { sku: "DEMO-06", name: "Масло подсолнечное 1 л", category: "Бакалея", brand: "Oltin Don", piece: 21000, box: [15, 300000], stock: 150 },
  { sku: "DEMO-07", name: "Мука высший сорт 2 кг", category: "Бакалея", brand: "Дон", piece: 17000, stock: 180 },
  { sku: "DEMO-08", name: "Соль поваренная 1 кг", category: "Бакалея", brand: "Баскунчак", piece: 3500, stock: 400 },
  { sku: "DEMO-09", name: "Печенье сахарное 400 г", category: "Сладости", brand: "Crafers", piece: 11000, box: [16, 168000], stock: 160 },
  { sku: "DEMO-10", name: "Шоколад молочный 90 г", category: "Сладости", brand: "Alpen Gold", piece: 13000, stock: 0 },
  { sku: "DEMO-11", name: "Средство для посуды 500 мл", category: "Бытовая химия", brand: "Fairy", piece: 16000, stock: 90 },
  { sku: "DEMO-12", name: "Бумажные полотенца, 2 рулона", category: "Бытовая химия", brand: "Familia", piece: 12000, stock: 110 },
];

async function user(phone: string, fullName: string, passwordHash: string) {
  return (
    (await db.user.findUnique({ where: { phone } })) ??
    db.user.create({ data: { phone, fullName, passwordHash } })
  );
}

async function main() {
  const region = await db.territory.findFirst({ where: { name: "г. Ташкент", type: "REGION" } });
  const district = await db.territory.findFirst({ where: { name: "Юнусабадский район", parentId: region?.id } });
  if (!region || !district) throw new Error("Нет справочника территорий: сначала npm run db:seed");

  const hash = await bcrypt.hash(PASSWORD, 12);
  const owner = await user(ACCOUNTS.supplier.phone, ACCOUNTS.supplier.fullName, hash);
  const courier = await user(ACCOUNTS.courier.phone, ACCOUNTS.courier.fullName, hash);
  const shopOwner = await user(ACCOUNTS.shop.phone, ACCOUNTS.shop.fullName, hash);

  const supplier =
    (await db.supplier.findUnique({ where: { inn: "300000001" } })) ??
    (await db.supplier.create({
      data: {
        legalName: "ООО «Демо Опт»",
        displayName: "Демо Опт",
        inn: "300000001",
        legalAddress: "г. Ташкент, Юнусабадский район, ул. Амира Темура, 1",
        phone: ACCOUNTS.supplier.phone,
        email: "demo@example.uz",
        contactPerson: ACCOUNTS.supplier.fullName,
        description: "Тестовый поставщик для проверки на телефоне",
        officeTerritoryId: district.id,
        officeAddress: "г. Ташкент, ул. Амира Темура, 1",
        officeLat: 41.3385,
        officeLng: 69.2846,
        status: "ACTIVE",
        approvedAt: new Date(),
        statusHistory: { create: { toStatus: "ACTIVE", comment: "Тестовые данные" } },
      },
    }));

  await db.supplierMember.upsert({
    where: { supplierId_userId: { supplierId: supplier.id, userId: owner.id } },
    update: {},
    create: { supplierId: supplier.id, userId: owner.id, role: "OWNER", delivers: true },
  });
  await db.supplierMember.upsert({
    where: { supplierId_userId: { supplierId: supplier.id, userId: courier.id } },
    update: {},
    create: { supplierId: supplier.id, userId: courier.id, role: "COURIER" },
  });
  await db.supplierTerritory.upsert({
    where: { supplierId_territoryId: { supplierId: supplier.id, territoryId: region.id } },
    update: {},
    create: { supplierId: supplier.id, territoryId: region.id },
  });

  const existingShop = await db.shopMember.findFirst({ where: { userId: shopOwner.id }, include: { shop: true } });
  if (!existingShop) {
    await db.shop.create({
      data: {
        name: "Магазин «Демо»",
        phone: ACCOUNTS.shop.phone,
        address: "г. Ташкент, Юнусабад, 4-й квартал, дом 12",
        lat: 41.3651,
        lng: 69.2878,
        contactName: ACCOUNTS.shop.fullName,
        territoryId: district.id,
        members: { create: { userId: shopOwner.id, role: "OWNER" } },
        statusHistory: { create: { toStatus: "NEW", reason: "Тестовые данные" } },
      },
    });
  }

  for (const [i, p] of PRODUCTS.entries()) {
    if (await db.product.findFirst({ where: { supplierId: supplier.id, sku: p.sku } })) continue;
    const category = await db.category.upsert({
      where: { supplierId_name: { supplierId: supplier.id, name: p.category } },
      update: {},
      create: { supplierId: supplier.id, name: p.category, sortOrder: i },
    });
    const product = await db.product.create({
      data: { supplierId: supplier.id, categoryId: category.id, name: p.name, brand: p.brand, sku: p.sku },
    });
    const piece = await db.productUnit.create({
      data: { productId: product.id, kind: "PIECE", price: p.piece, physicalQty: p.stock, sortOrder: 0 },
    });
    if (p.stock > 0) {
      await db.stockMovement.create({
        data: {
          productUnitId: piece.id, type: "INITIAL", physicalDelta: p.stock, reservedDelta: 0,
          physicalAfter: p.stock, reservedAfter: 0, userId: owner.id, reason: "Тестовые данные",
        },
      });
    }
    if (p.box) {
      const [perBox, price] = p.box;
      // Л4: коробка = N штук, остаток коробок считается из штук
      await db.productUnit.create({
        data: {
          productId: product.id, kind: "BOX", price, sortOrder: 1,
          baseUnitId: piece.id, baseQty: perBox, physicalQty: Math.floor(p.stock / perBox),
        },
      });
    }
  }

  console.log(`Готово. Пароль у всех тестовых учётных записей: ${PASSWORD}`);
  console.log(`  Поставщик (сам развозит): ${ACCOUNTS.supplier.phone}`);
  console.log(`  Доставщик поставщика:     ${ACCOUNTS.courier.phone}`);
  console.log(`  Магазин:                  ${ACCOUNTS.shop.phone}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });

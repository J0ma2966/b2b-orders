import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { REGIONS } from "./territories";
import { initialSuperadminPassword } from "./superadmin";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function upsertTerritory(name: string, type: "COUNTRY" | "REGION" | "CITY" | "DISTRICT", parentId: string | null, sortOrder = 0) {
  const existing = await db.territory.findFirst({ where: { name, parentId } });
  if (existing) return existing;
  return db.territory.create({ data: { name, type, parentId, sortOrder } });
}

async function main() {
  const country = await upsertTerritory("Узбекистан", "COUNTRY", null);
  for (const [i, r] of REGIONS.entries()) {
    const region = await upsertTerritory(r.name, "REGION", country.id, i);
    for (const city of r.cities) await upsertTerritory(city, "CITY", region.id);
    for (const d of r.districts ?? []) await upsertTerritory(d, "DISTRICT", region.id);
  }

  await db.platformSetting.upsert({
    where: { key: "defaultCommissionRate" },
    update: {},
    create: { key: "defaultCommissionRate", value: 3 },
  });

  const phone = process.env.SUPERADMIN_PHONE ?? "+998900000000";
  const { password, mustChange, generated } = initialSuperadminPassword(process.env.SUPERADMIN_PASSWORD);
  const admin = await db.user.findUnique({ where: { phone } });
  if (!admin) {
    await db.user.create({
      data: {
        phone,
        fullName: "Супер-администратор",
        passwordHash: await bcrypt.hash(password, 12),
        isSuperAdmin: true,
        mustChangePassword: mustChange,
      },
    });
    console.log(`Создан супер-администратор ${phone}`);
    if (generated) console.log(`Временный пароль: ${password}  (сменить при первом входе; задать свой — SUPERADMIN_PASSWORD)`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });

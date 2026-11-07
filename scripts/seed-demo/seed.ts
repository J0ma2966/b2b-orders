// Тестовые данные для проверки всей платформы: 4 подтверждённых поставщика (с командой,
// территориями, условиями заказа, бонусами), 58 товаров со всеми полями и фото, 8 магазинов
// в Ташкенте, история заказов за полтора месяца, заказы во всех статусах, долги и оплаты,
// замены, касса доставщика и одна заявка поставщика на модерации.
//
//   npm run seed:demo             — добавить данные (повторный запуск ничего не дублирует)
//   npm run seed:demo -- --reset  — удалить эти тестовые данные и создать заново
//
// Не для рабочей базы. Пароль у всех тестовых учётных записей — demo12345 (или DEMO_PASSWORD).
import "dotenv/config";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import type { OrderStatus, PaymentMethod, StockMovementType, UnitKind } from "../../src/generated/prisma/enums";
import { movementDeltas } from "../../src/lib/stock-core";
import { distributePayment } from "../../src/lib/finance-core";
import { formatSku } from "../../src/lib/sku-core";
import { PENDING_SUPPLIER, SHOPS, SUPPLIERS, type DemoProduct, type DemoShop, type DemoSupplier } from "./data";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const PASSWORD = process.env.DEMO_PASSWORD || "demo12345";
const UPLOADS = path.resolve(process.env.UPLOAD_DIR ?? "./storage/uploads");
const IMAGES = path.resolve(import.meta.dirname, "images");
const RESET = process.argv.includes("--reset");
const MARKER = "demoSeedCreatedAt"; // отметка, что тестовые данные созданы полностью

const UNIT_LABEL: Record<UnitKind, string> = { PIECE: "шт.", BOX: "коробка", BLOCK: "блок", KG: "кг", PACK: "упаковка", LITER: "л", OTHER: "другая" };
const generateQrToken = () => Array.from({ length: 10 }, () => "23456789ABCDEFGHJKMNPQRSTUVWXYZ"[randomInt(31)]).join("");
const num = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const r2 = (n: number) => Math.round(n * 100) / 100;

// Детерминированный генератор: при каждом запуске получается одна и та же история
let seed = 20261107;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

const NOW = Date.now();
const HOUR = 3600_000;
const hoursAgo = (h: number) => new Date(NOW - h * HOUR);
const dayOnly = (d: Date) => new Date(new Date(d.getTime() + 5 * HOUR).toISOString().slice(0, 10));

// ───────────── Справочники ─────────────

async function territory(region: string, child?: string) {
  const r = await db.territory.findFirst({ where: { name: region, type: "REGION" } });
  if (!r) throw new Error("Нет справочника территорий: сначала выполните npm run db:seed");
  if (!child) return r;
  const c = await db.territory.findFirst({ where: { name: child, parentId: r.id } });
  if (!c) throw new Error(`Нет территории «${child}» в «${region}»`);
  return c;
}

let passwordHash = "";
async function user(phone: string, fullName: string) {
  const found = await db.user.findUnique({ where: { phone } });
  if (found) return found;
  return db.user.create({ data: { phone, fullName, passwordHash, locale: "ru" } });
}

async function image(file: string) {
  const rel = `demo/${file}`;
  await mkdir(path.join(UPLOADS, "demo"), { recursive: true });
  await copyFile(path.join(IMAGES, file), path.join(UPLOADS, rel));
  return rel;
}

// ───────────── Склад: как applyStock в src/lib/stock.ts, но с датой операции ─────────────

async function stock(unitId: string, type: StockMovementType, qty: number, at: Date, userId: string | null, reason: string, related?: { entity: string; id: string }) {
  const link = await db.productUnit.findUniqueOrThrow({ where: { id: unitId }, select: { kind: true, baseUnitId: true, baseQty: true } });
  if (link.baseUnitId && link.baseQty) {
    const ratio = num(link.baseQty);
    reason = `${reason} (${qty} ${UNIT_LABEL[link.kind]} × ${ratio})`;
    unitId = link.baseUnitId;
    qty = Math.round(qty * ratio * 1000) / 1000;
  }
  const d = movementDeltas(type, qty);
  const p = new Prisma.Decimal(d.physical);
  const r = new Prisma.Decimal(d.reserved);
  const rows = await db.$queryRaw<{ physicalQty: Prisma.Decimal; reservedQty: Prisma.Decimal }[]>`
    UPDATE "ProductUnit"
       SET "physicalQty" = "physicalQty" + ${p}, "reservedQty" = "reservedQty" + ${r}, "updatedAt" = now()
     WHERE id = ${unitId}
       AND "physicalQty" + ${p} >= 0 AND "reservedQty" + ${r} >= 0 AND "physicalQty" + ${p} >= "reservedQty" + ${r}
     RETURNING "physicalQty", "reservedQty"`;
  if (rows.length === 0) return false;
  await db.stockMovement.create({
    data: {
      productUnitId: unitId, type, physicalDelta: p, reservedDelta: r,
      physicalAfter: rows[0].physicalQty, reservedAfter: rows[0].reservedQty,
      userId, reason, relatedEntity: related?.entity, relatedId: related?.id, createdAt: at,
    },
  });
  await db.$executeRaw`
    UPDATE "ProductUnit" u
       SET "physicalQty" = GREATEST(0, FLOOR((b."physicalQty" - b."reservedQty") / u."baseQty")), "reservedQty" = 0, "updatedAt" = now()
      FROM "ProductUnit" b
     WHERE b.id = ${unitId} AND u."baseUnitId" = b.id`;
  return true;
}

// ───────────── Поставщики и каталог ─────────────

type UnitRef = { id: string; kind: UnitKind; price: number; productName: string; per?: number };
type Built = {
  def: DemoSupplier;
  id: string;
  ownerId: string;
  staffIds: string[];
  courierIds: string[]; // кто развозит: доставщики или сам владелец
  products: Map<string, { def: DemoProduct; id: string; units: UnitRef[] }>;
  commissionRate: number;
};

async function createSupplier(def: DemoSupplier, defaultRate: number): Promise<Built> {
  const owner = await user(def.owner.phone, def.owner.name);
  const admins = await Promise.all(def.admins.map((a) => user(a.phone, a.name)));
  const couriers = await Promise.all(def.couriers.map((c) => user(c.phone, c.name)));
  const office = await territory("г. Ташкент", def.district);
  const created = hoursAgo(24 * 75);

  const supplier = await db.supplier.create({
    data: {
      legalName: def.legalName, displayName: def.displayName, inn: def.inn,
      legalAddress: def.legalAddress, phone: def.owner.phone, extraPhones: def.extraPhones,
      email: def.email, website: def.website ?? null, contactPerson: def.owner.name, description: def.description,
      logoPath: await image(`logo-${def.key}.jpg`),
      officeTerritoryId: office.id, officeAddress: def.officeAddress, officeLat: def.lat, officeLng: def.lng,
      status: "ACTIVE", approvedAt: hoursAgo(24 * 74),
      commissionRate: def.commissionRate ?? null,
      minOrderTotal: def.minOrderTotal, orderCutoffHour: def.orderCutoffHour,
      skipAssembly: def.skipAssembly ?? false, creditOverLimitBlock: def.creditOverLimitBlock ?? false,
      skuSeq: def.products.length,
      createdAt: created,
      statusHistory: {
        create: [
          { toStatus: "PENDING", comment: "Заявка подана", createdAt: created },
          { fromStatus: "PENDING", toStatus: "ACTIVE", comment: "Документы проверены (тестовые данные)", createdAt: hoursAgo(24 * 74) },
        ],
      },
    },
  });
  await db.supplierMember.create({ data: { supplierId: supplier.id, userId: owner.id, role: "OWNER", delivers: !!def.owner.delivers, createdAt: created } });
  for (const a of admins) await db.supplierMember.create({ data: { supplierId: supplier.id, userId: a.id, role: "ADMIN", createdAt: created } });
  for (const c of couriers) await db.supplierMember.create({ data: { supplierId: supplier.id, userId: c.id, role: "COURIER", createdAt: created } });
  for (const t of def.territories) {
    const terr = await territory(t.region, t.city);
    await db.supplierTerritory.create({
      data: { supplierId: supplier.id, territoryId: terr.id, deliveryWeekdays: t.weekdays, courierId: t.courier !== undefined ? couriers[t.courier]?.id ?? null : null },
    });
  }

  const categories = new Map<string, string>();
  for (const p of def.products) {
    if (categories.has(p.category)) continue;
    const c = await db.category.create({ data: { supplierId: supplier.id, name: p.category, sortOrder: categories.size } });
    categories.set(p.category, c.id);
  }

  const products: Built["products"] = new Map();
  for (const [i, p] of def.products.entries()) {
    const attributes = [
      { name: "Страна производства", value: p.country },
      { name: "Срок годности", value: p.shelfLife },
      { name: "Штрихкод", value: p.barcode },
      ...(p.units.slice(1).map((u) => ({ name: `В одной единице «${UNIT_LABEL[u.kind]}»`, value: `${u.per} ${UNIT_LABEL[p.units[0].kind]}` }))),
      ...(p.extra ?? []).map(([name, value]) => ({ name, value })),
    ];
    const product = await db.product.create({
      data: {
        supplierId: supplier.id, categoryId: categories.get(p.category)!, name: p.name, description: p.description,
        brand: p.brand, sku: formatSku(i + 1), weightKg: p.weightKg, attributes,
        photoPaths: [await image(`${p.key}.jpg`)], isAvailable: p.available ?? true,
        allowReplacement: !p.noReplacement, createdAt: hoursAgo(24 * 70 - i),
      },
    });
    const [baseDef, ...linked] = p.units;
    const base = await db.productUnit.create({
      data: { productId: product.id, kind: baseDef.kind, price: baseDef.price, sortOrder: 0, lowStockThreshold: p.lowStock ?? null },
    });
    const units: UnitRef[] = [{ id: base.id, kind: base.kind, price: baseDef.price, productName: p.name }];
    for (const [j, u] of linked.entries()) {
      const unit = await db.productUnit.create({
        data: { productId: product.id, kind: u.kind, price: u.price, sortOrder: j + 1, baseUnitId: base.id, baseQty: u.per },
      });
      units.push({ id: unit.id, kind: unit.kind, price: u.price, productName: p.name, per: u.per });
    }
    // История цен: первая цена при создании, у части товаров — подорожание три недели назад
    for (const u of units) {
      const raised = rand() < 0.3;
      const first = raised ? Math.round((u.price * 0.92) / 500) * 500 : u.price;
      await db.priceHistory.create({ data: { productUnitId: u.id, oldPrice: null, newPrice: first, userId: owner.id, createdAt: hoursAgo(24 * 70) } });
      if (raised) await db.priceHistory.create({ data: { productUnitId: u.id, oldPrice: first, newPrice: u.price, userId: owner.id, createdAt: hoursAgo(24 * 21) } });
    }
    if (p.stock > 0) {
      // Начальный остаток; история продаж ниже его уменьшает
      await stock(base.id, "INITIAL", p.stock, hoursAgo(24 * 70), owner.id, "Начальный остаток");
    } else {
      // Товара нет в наличии: было и закончилось
      await stock(base.id, "INITIAL", 50, hoursAgo(24 * 70), owner.id, "Начальный остаток");
      await stock(base.id, "WRITE_OFF", 50, hoursAgo(24 * 3), owner.id, "Истёк срок годности партии");
    }
    products.set(p.key, { def: p, id: product.id, units });
  }

  return {
    def, id: supplier.id, ownerId: owner.id,
    staffIds: [owner.id, ...admins.map((a) => a.id)],
    courierIds: def.owner.delivers ? [owner.id] : couriers.map((c) => c.id),
    products, commissionRate: def.commissionRate ?? defaultRate,
  };
}

// ───────────── Магазины ─────────────

type BuiltShop = { def: DemoShop; id: string; ownerId: string; address: string; lat: number; lng: number; phone: string; contact: string; verified: boolean };

async function createShop(def: DemoShop): Promise<BuiltShop> {
  const owner = await user(def.owner.phone, def.owner.name);
  const staff = def.staff ? await user(def.staff.phone, def.staff.name) : null;
  const terr = await territory("г. Ташкент", def.district);
  const created = hoursAgo(24 * 60);
  const shop = await db.shop.create({
    data: {
      name: def.name, inn: def.inn ?? null, phone: def.owner.phone, phone2: def.phone2 ?? null,
      photoPaths: [await image(`shop-${def.key}.jpg`)], address: def.address, lat: def.lat, lng: def.lng,
      contactName: def.owner.name, territoryId: terr.id, createdAt: created,
      members: { create: [{ userId: owner.id, role: "OWNER", createdAt: created }, ...(staff ? [{ userId: staff.id, role: "STAFF" as const, createdAt: created }] : [])] },
      statusHistory: { create: { toStatus: "NEW", reason: "Регистрация магазина", createdAt: created } },
    },
  });
  return { def, id: shop.id, ownerId: owner.id, address: def.address, lat: def.lat, lng: def.lng, phone: def.owner.phone, contact: def.owner.name, verified: false };
}

// Условия работы магазина с поставщиком: долг, лимит, отсрочка
const TERMS: Record<string, Record<string, { limit: number | null; days: number | null }>> = {
  food: { baraka: { limit: 5_000_000, days: 14 }, oila: { limit: 3_000_000, days: 7 }, navruz: { limit: null, days: 30 } },
  drinks: { sharq: { limit: 1_500_000, days: 10 }, baraka: { limit: 1_000_000, days: 7 } },
  home: { baraka: { limit: 2_000_000, days: 14 }, navruz: { limit: 4_000_000, days: 21 }, hamkor: { limit: 1_000_000, days: 7 } },
  sweets: { oila: { limit: 500_000, days: null } },
};

async function account(shop: BuiltShop, sup: Built) {
  const t = TERMS[sup.def.key]?.[shop.def.key];
  return db.shopAccount.upsert({
    where: { shopId_supplierId: { shopId: shop.id, supplierId: sup.id } },
    update: {},
    create: { shopId: shop.id, supplierId: sup.id, creditAllowed: !!t, creditLimit: t?.limit ?? null, paymentTermDays: t?.days ?? null, createdAt: hoursAgo(24 * 50) },
  });
}

async function debtEntry(accountId: string, e: { type: "ORDER_CHARGE" | "ORDER_PAYMENT" | "DEBT_PAYMENT" | "CORRECTION"; amount: number; orderId?: string; method?: PaymentMethod; comment: string; at: Date; userId: string | null }) {
  if (e.amount === 0) return;
  const acc = await db.shopAccount.update({ where: { id: accountId }, data: { balance: { increment: e.amount } } });
  await db.debtEntry.create({
    data: {
      accountId, orderId: e.orderId ?? null, type: e.type, amount: e.amount, balanceAfter: acc.balance,
      paymentMethod: e.method ?? null, comment: e.comment, occurredAt: e.at, createdAt: e.at, userId: e.userId,
    },
  });
}

// ───────────── Заказы ─────────────

type Line = [key: string, unit: number, qty: number];
type OrderSpec = {
  sup: Built;
  shop: BuiltShop;
  status: OrderStatus;
  placed: Date;
  lines: Line[];
  courier?: number;
  pay?: { method: PaymentMethod; share: number }; // какая доля суммы получена при доставке
  accept?: number[]; // принято по строкам (частичная приёмка)
  comment?: string;
  reason?: string;
};

const counts: Record<string, number> = {};

async function makeOrder(o: OrderSpec) {
  const { sup, shop } = o;
  const items = o.lines
    .map(([key, unitIndex, qty]) => {
      const p = sup.products.get(key);
      const u = p?.units[unitIndex];
      return p && u ? { unit: u, qty, name: p.def.name } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (items.length === 0) return null;
  const ordered = r2(items.reduce((s, i) => s + i.unit.price * i.qty, 0));
  const draft = o.status === "DRAFT";
  const number = draft ? null : Number((await db.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_number_seq')`)[0].nextval);
  const t = (h: number) => new Date(o.placed.getTime() + h * HOUR);
  const courierId = o.courier !== undefined ? sup.courierIds[o.courier % sup.courierIds.length] : null;
  const supplierActor = sup.staffIds[sup.staffIds.length > 1 ? 1 : 0];

  // Путь заказа по статусам: [статус, через сколько часов после оформления, тип события, роль]
  type Step = [OrderStatus, number, string, string];
  const pre: Step[] = [["PLACED", 0, "status", "SHOP"]];
  const accept: Step[] = sup.def.skipAssembly
    ? [["READY", 1, "status", "SUPPLIER_ADMIN"]]
    : [["ACCEPTED", 1, "status", "SUPPLIER_ADMIN"], ["ASSEMBLING", 2, "status", "SUPPLIER_ADMIN"], ["READY", 4, "status", "SUPPLIER_ADMIN"]];
  const delivery: Step[] = [["ASSIGNED", 5, "courier.assigned", "SUPPLIER_ADMIN"], ["IN_TRANSIT", 20, "status", "COURIER"]];
  const upTo = (steps: Step[], s: OrderStatus) => steps.slice(0, steps.findIndex((x) => x[0] === s) + 1);
  const full = [...pre, ...accept, ...delivery];
  let path: Step[] = [];
  switch (o.status) {
    case "DRAFT": break;
    case "PLACED": case "ACCEPTED": case "ASSEMBLING": case "READY": case "ASSIGNED": case "IN_TRANSIT":
      path = upTo(full, o.status); break;
    case "DELIVERY_PROBLEM": path = [...full, ["DELIVERY_PROBLEM", 21, "delivery.problem", "COURIER"]]; break;
    case "NEEDS_CONFIRMATION": path = [...full, ["NEEDS_CONFIRMATION", 21, "cancel.requested", "SHOP"]]; break;
    case "COMPLETED": case "PARTIALLY_ACCEPTED": path = [...full, [o.status, 22, "delivery.confirmed", "COURIER"]]; break;
    case "NOT_DELIVERED": path = [...full, ["NOT_DELIVERED", 22, "delivery.not_delivered", "COURIER"]]; break;
    case "CANCELLED_BY_SHOP": path = [...pre, ["CANCELLED_BY_SHOP", 1, "status", "SHOP"]]; break;
    case "REJECTED": path = [...pre, ["REJECTED", 2, "status", "SUPPLIER_ADMIN"]]; break;
    case "CANCELLED_BY_SUPPLIER": path = [...pre, ...accept.slice(0, 1), ["CANCELLED_BY_SUPPLIER", 3, "status", "SUPPLIER_ADMIN"]]; break;
    default: throw new Error(`Статус ${o.status} не поддерживается`);
  }
  const reached = (s: OrderStatus) => path.find((x) => x[0] === s);
  const last = path.at(-1);

  const order = await db.order.create({
    data: {
      supplierId: sup.id, shopId: shop.id, status: o.status, number, total: ordered, createdByUserId: shop.ownerId,
      createdAt: o.placed, updatedAt: last ? t(last[1]) : o.placed,
      ...(!draft && {
        placedAt: o.placed, paymentMethod: o.pay?.method ?? pick<PaymentMethod>(["CASH", "CASH", "CARD", "TRANSFER"]),
        deliveryAddress: shop.address, deliveryLat: shop.lat, deliveryLng: shop.lng,
        contactName: shop.contact, contactPhone: shop.phone, deliveryDate: dayOnly(t(20)),
        commissionRate: sup.commissionRate, qrToken: generateQrToken(), comment: o.comment ?? null,
      }),
      items: { create: items.map((i) => ({ productUnitId: i.unit.id, productName: i.name, unitLabel: UNIT_LABEL[i.unit.kind], price: i.unit.price, qty: i.qty, createdAt: o.placed })) },
    },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  counts[o.status] = (counts[o.status] ?? 0) + 1;
  if (draft) return order;

  const label = `Заказ №${number}`;
  const rel = { entity: "Order", id: order.id };
  // Резерв при оформлении; если товара не хватило — строку убираем, как сделала бы проверка корзины
  const kept: typeof order.items = [];
  for (const it of order.items) {
    if (await stock(it.productUnitId, "RESERVE", num(it.qty), o.placed, shop.ownerId, `${label} оформлен`, rel)) kept.push(it);
    else await db.orderItem.delete({ where: { id: it.id } });
  }
  if (kept.length === 0) {
    await db.order.delete({ where: { id: order.id } });
    counts[o.status]--;
    return null;
  }

  const data: Prisma.OrderUncheckedUpdateInput = { total: r2(kept.reduce((s, i) => s + num(i.price) * num(i.qty), 0)) };
  if (reached("ACCEPTED") || reached("READY")) data.acceptedAt = t(1);
  if (reached("ASSIGNED")) Object.assign(data, { courierId, assignedAt: t(5), routeOrder: 1 });
  if (reached("IN_TRANSIT")) data.inTransitAt = t(20);

  const closedNoSale = ["CANCELLED_BY_SHOP", "REJECTED", "CANCELLED_BY_SUPPLIER", "NOT_DELIVERED"] as OrderStatus[];
  if (closedNoSale.includes(o.status)) {
    for (const it of kept) await stock(it.productUnitId, "RELEASE", num(it.qty), t(last![1]), supplierActor, `${label}: ${o.reason ?? "отмена"}`, rel);
    Object.assign(data, { qrToken: null, cancelReason: o.reason ?? null });
    if (o.status === "NOT_DELIVERED") Object.assign(data, { problemReason: "CLOSED", problemNote: o.reason, problemAt: t(21) });
    else Object.assign(data, { cancelledAt: t(last![1]), cancelledBy: o.status === "CANCELLED_BY_SHOP" ? "SHOP" : "SUPPLIER" });
  }
  if (o.status === "DELIVERY_PROBLEM") Object.assign(data, { problemReason: "CLOSED", problemNote: o.reason ?? "Магазин не отвечает на звонки", problemAt: t(21) });
  if (o.status === "NEEDS_CONFIRMATION") Object.assign(data, { cancelRequestedAt: t(21), cancelRequestReason: o.reason ?? "Передумали", statusBeforeRequest: "IN_TRANSIT" });

  if (o.status === "COMPLETED" || o.status === "PARTIALLY_ACCEPTED") {
    const at = t(22);
    let total = 0;
    for (const [i, it] of kept.entries()) {
      const qty = num(it.qty);
      const acc = Math.min(qty, o.accept?.[i] ?? qty);
      if (acc > 0) await stock(it.productUnitId, "SALE", acc, at, courierId, `${label} принят`, rel);
      if (qty - acc > 0) await stock(it.productUnitId, "RETURN_UNACCEPTED", qty - acc, at, courierId, `${label}: не принято`, rel);
      await db.orderItem.update({ where: { id: it.id }, data: { deliveredQty: qty, acceptedQty: acc } });
      total += num(it.price) * acc;
    }
    total = r2(total);
    const acc = await account(shop, sup);
    const before = num((await db.shopAccount.findUniqueOrThrow({ where: { id: acc.id } })).balance);
    let received = Math.round((total * (o.pay?.share ?? 1)) / 1000) * 1000;
    // Без права на долг — вся сумма; с лимитом — не выше лимита (как при приёмке в приложении)
    const limit = acc.creditAllowed ? (acc.creditLimit === null ? Infinity : num(acc.creditLimit)) : Math.max(0, before);
    if (before + total - received > limit) received = Math.max(received, Math.ceil(before + total - Math.max(limit, Math.max(0, before))));
    received = Math.max(0, Math.min(received, total + Math.max(0, before)));
    const dist = distributePayment(total, received, before);
    const method = o.pay?.method ?? "CASH";
    await debtEntry(acc.id, { type: "ORDER_CHARGE", amount: total, orderId: order.id, comment: `${label}: принятые товары`, at, userId: courierId });
    if (dist.toOrder > 0) await debtEntry(acc.id, { type: "ORDER_PAYMENT", amount: -dist.toOrder, orderId: order.id, method, comment: `${label}: оплата при получении`, at, userId: courierId });
    if (dist.toDebt > 0) await debtEntry(acc.id, { type: "DEBT_PAYMENT", amount: -dist.toDebt, orderId: order.id, method, comment: `${label}: погашение прежнего долга`, at, userId: courierId });
    if (dist.overpaid > 0) await debtEntry(acc.id, { type: "DEBT_PAYMENT", amount: -dist.overpaid, orderId: order.id, method, comment: `${label}: переплата`, at, userId: courierId });
    Object.assign(data, {
      qrUsedAt: at, deliveredAt: at, completedAt: at, orderedTotal: data.total, total,
      receivedAmount: received, receivedMethod: method, paidToOrder: dist.toOrder + dist.fromPrepay, paidToDebt: dist.toDebt,
      overpaid: dist.overpaid, orderDebt: dist.orderDebt, balanceBefore: before, balanceAfter: dist.balanceAfter,
    });
    if (!shop.verified) {
      shop.verified = true;
      await db.shop.update({ where: { id: shop.id }, data: { status: "VERIFIED" } });
      await db.shopStatusHistory.create({ data: { shopId: shop.id, fromStatus: "NEW", toStatus: "VERIFIED", reason: `Первая доставка, ${label.toLowerCase()}`, createdAt: at } });
    }
  }
  await db.order.update({ where: { id: order.id }, data });

  let prev: OrderStatus = "DRAFT";
  for (const [status, h, type, role] of path) {
    const userId = role === "SHOP" ? shop.ownerId : role === "COURIER" ? courierId : supplierActor;
    await db.orderEvent.create({ data: { orderId: order.id, type, fromStatus: prev, toStatus: status, userId, actorRole: role, comment: closedNoSale.includes(status) || status === "DELIVERY_PROBLEM" || status === "NEEDS_CONFIRMATION" ? o.reason ?? null : null, createdAt: t(h) } });
    prev = status;
  }
  return order;
}

// Случайный набор строк заказа на сумму не меньше минимальной у поставщика
function randomLines(sup: Built, n: number): Line[] {
  const keys = [...sup.products.values()].filter((p) => p.def.stock > 0 && p.def.available !== false);
  const chosen = new Set<string>();
  while (chosen.size < Math.min(n, keys.length)) chosen.add(pick(keys).def.key);
  const lines: Line[] = [...chosen].map((key) => {
    const p = sup.products.get(key)!;
    const unit = p.units.length > 1 && rand() < 0.4 ? 1 : 0;
    const kind = p.units[unit].kind;
    const qty = kind === "KG" ? between(2, 8) / 2 : unit > 0 ? between(1, 3) : between(3, 15);
    return [key, unit, qty];
  });
  const total = () => lines.reduce((s, [k, u, q]) => s + sup.products.get(k)!.units[u].price * q, 0);
  const min = sup.def.minOrderTotal ?? 0;
  while (total() < min * 1.1) lines[0][2] = sup.products.get(lines[0][0])!.units[lines[0][1]].kind === "KG" ? lines[0][2] + 1 : lines[0][2] + 2;
  return lines;
}

async function fillOrders(sups: Built[], shops: Map<string, BuiltShop>) {
  const S = (k: string) => shops.get(k)!;
  const regular = [...shops.values()].filter((s) => s.def.key !== "bahor");
  const sup = (k: string) => sups.find((s) => s.def.key === k)!;

  // История: завершённые заказы за последние 45 дней, по 9–12 на поставщика
  for (const s of sups) {
    const n = between(9, 12);
    const days = Array.from({ length: n }, () => between(3, 45)).sort((a, b) => b - a);
    for (const d of days) {
      const shop = pick(regular);
      const credit = !!TERMS[s.def.key]?.[shop.def.key];
      const share = credit && rand() < 0.5 ? pick([0, 0.5, 0.7]) : 1;
      await makeOrder({ sup: s, shop, status: "COMPLETED", placed: hoursAgo(24 * d + between(0, 6)), lines: randomLines(s, between(2, 5)), courier: between(0, 1), pay: { method: pick<PaymentMethod>(["CASH", "CASH", "CASH", "CARD", "TRANSFER"]), share } });
    }
  }

  const food = sup("food"), drinks = sup("drinks"), home = sup("home"), sweets = sup("sweets");

  // Просроченный долг: «Oila» не заплатила 18 дней назад при отсрочке 7 дней
  await makeOrder({ sup: food, shop: S("oila"), status: "COMPLETED", placed: hoursAgo(24 * 18), lines: [["food-rice-devzira", 1, 3], ["food-oil-sunflower", 1, 2], ["food-sugar", 1, 2]], courier: 0, pay: { method: "CASH", share: 0.3 } });
  // Частичная приёмка, недоставленный, отменённые и отклонённый заказы
  await makeOrder({ sup: food, shop: S("navruz"), status: "PARTIALLY_ACCEPTED", placed: hoursAgo(24 * 9), lines: [["food-milk", 1, 2], ["food-butter", 0, 20], ["food-tea-green", 0, 40]], accept: [2, 15, 40], courier: 1, pay: { method: "TRANSFER", share: 1 } });
  await makeOrder({ sup: home, shop: S("hamkor"), status: "PARTIALLY_ACCEPTED", placed: hoursAgo(24 * 6), lines: [["home-dish", 1, 2], ["home-powder", 0, 6], ["home-soap", 1, 4]], accept: [2, 4, 3], courier: 0, pay: { method: "CASH", share: 0.6 } });
  await makeOrder({ sup: food, shop: S("dostlik"), status: "NOT_DELIVERED", placed: hoursAgo(24 * 5), lines: randomLines(food, 3), courier: 1, reason: "Магазин закрыт, на звонки не отвечают" });
  await makeOrder({ sup: drinks, shop: S("yangihayot"), status: "CANCELLED_BY_SHOP", placed: hoursAgo(24 * 4), lines: randomLines(drinks, 3), reason: "Заказали у другого поставщика" });
  await makeOrder({ sup: home, shop: S("sharq"), status: "REJECTED", placed: hoursAgo(24 * 3), lines: randomLines(home, 2), reason: "Нет доставки в этот день, оформите на четверг" });
  await makeOrder({ sup: sweets, shop: S("hamkor"), status: "CANCELLED_BY_SUPPLIER", placed: hoursAgo(24 * 2), lines: randomLines(sweets, 2), reason: "Закончилась партия халвы" });

  // Заказы в работе — их видно в разделах «Заказы», «Доставка» и в приложении доставщика
  await makeOrder({ sup: food, shop: S("baraka"), status: "PLACED", placed: hoursAgo(1), lines: [["food-rice-devzira", 1, 2], ["food-oil-sunflower", 1, 1], ["food-tea-green", 0, 40], ["food-ketchup", 0, 10]], comment: "Позвоните перед приездом" });
  await makeOrder({ sup: food, shop: S("navruz"), status: "PLACED", placed: hoursAgo(2), lines: randomLines(food, 4) });
  await makeOrder({ sup: food, shop: S("oila"), status: "ACCEPTED", placed: hoursAgo(5), lines: randomLines(food, 3) });
  await makeOrder({ sup: food, shop: S("hamkor"), status: "ASSEMBLING", placed: hoursAgo(6), lines: randomLines(food, 5) });
  await makeOrder({ sup: food, shop: S("sharq"), status: "READY", placed: hoursAgo(8), lines: randomLines(food, 3) });
  await makeOrder({ sup: food, shop: S("yangihayot"), status: "ASSIGNED", placed: hoursAgo(10), lines: randomLines(food, 3), courier: 0 });
  await makeOrder({ sup: food, shop: S("baraka"), status: "IN_TRANSIT", placed: hoursAgo(22), lines: randomLines(food, 4), courier: 0, comment: "Вход со двора, разгрузка до 12:00" });
  await makeOrder({ sup: food, shop: S("dostlik"), status: "IN_TRANSIT", placed: hoursAgo(23), lines: randomLines(food, 3), courier: 1 });
  await makeOrder({ sup: food, shop: S("oila"), status: "DELIVERY_PROBLEM", placed: hoursAgo(24), lines: randomLines(food, 2), courier: 1, reason: "Магазин не отвечает на звонки, двери закрыты" });

  await makeOrder({ sup: drinks, shop: S("sharq"), status: "PLACED", placed: hoursAgo(1.5), lines: randomLines(drinks, 4) });
  await makeOrder({ sup: drinks, shop: S("baraka"), status: "READY", placed: hoursAgo(4), lines: [["drk-water-15", 1, 10], ["drk-cola", 1, 5], ["drk-juice-apple", 0, 12]] });
  await makeOrder({ sup: drinks, shop: S("oila"), status: "ASSIGNED", placed: hoursAgo(9), lines: randomLines(drinks, 3), courier: 0 });
  await makeOrder({ sup: drinks, shop: S("navruz"), status: "IN_TRANSIT", placed: hoursAgo(21), lines: randomLines(drinks, 5), courier: 0 });

  await makeOrder({ sup: home, shop: S("navruz"), status: "PLACED", placed: hoursAgo(3), lines: randomLines(home, 4) });
  await makeOrder({ sup: home, shop: S("baraka"), status: "ACCEPTED", placed: hoursAgo(6), lines: randomLines(home, 3) });
  await makeOrder({ sup: home, shop: S("yangihayot"), status: "ASSIGNED", placed: hoursAgo(12), lines: randomLines(home, 3), courier: 0 });
  await makeOrder({ sup: home, shop: S("hamkor"), status: "IN_TRANSIT", placed: hoursAgo(21), lines: randomLines(home, 3), courier: 0 });
  await makeOrder({ sup: home, shop: S("dostlik"), status: "NEEDS_CONFIRMATION", placed: hoursAgo(22), lines: randomLines(home, 2), courier: 0, reason: "Ошиблись с количеством, просим отменить" });

  await makeOrder({ sup: sweets, shop: S("oila"), status: "PLACED", placed: hoursAgo(0.5), lines: [["sw-candies-kg", 0, 2.5], ["sw-halva", 0, 1.5], ["sw-navat", 0, 4]], comment: "Халву свежую, пожалуйста" });
  await makeOrder({ sup: sweets, shop: S("baraka"), status: "ASSIGNED", placed: hoursAgo(7), lines: randomLines(sweets, 3), courier: 0 });
  await makeOrder({ sup: sweets, shop: S("hamkor"), status: "IN_TRANSIT", placed: hoursAgo(20), lines: randomLines(sweets, 3), courier: 0 });

  // Корзины (черновики) — магазин видит их в «Корзине»
  await makeOrder({ sup: drinks, shop: S("baraka"), status: "DRAFT", placed: hoursAgo(0.3), lines: [["drk-water-05", 1, 4], ["drk-icetea", 0, 12], ["drk-energy", 0, 6]] });
  await makeOrder({ sup: sweets, shop: S("baraka"), status: "DRAFT", placed: hoursAgo(0.2), lines: [["sw-chocolate", 1, 1], ["sw-cookies-home", 0, 2]] });
  await makeOrder({ sup: food, shop: S("navruz"), status: "DRAFT", placed: hoursAgo(0.4), lines: [["food-flour", 1, 3], ["food-pasta", 1, 2]] });
  await makeOrder({ sup: food, shop: S("bahor"), status: "DRAFT", placed: hoursAgo(0.1), lines: [["food-salt", 0, 10], ["food-sugar", 0, 10]] });

  // Погашения долгов отдельно от заказов
  for (const s of sups) {
    const accounts = await db.shopAccount.findMany({ where: { supplierId: s.id, balance: { gt: 0 } } });
    for (const a of accounts) {
      const shop = [...shops.values()].find((x) => x.id === a.shopId)!;
      if (shop.def.key === "oila" && s.def.key === "food") continue; // просрочка остаётся
      if (rand() < 0.5) {
        const amount = Math.round((num(a.balance) * pick([0.3, 0.5, 1])) / 1000) * 1000;
        if (amount > 0) await debtEntry(a.id, { type: "DEBT_PAYMENT", amount: -amount, method: pick<PaymentMethod>(["CASH", "TRANSFER"]), comment: "Погашение долга", at: hoursAgo(24 * between(1, 3)), userId: s.ownerId });
      }
    }
  }
  // Переплата (аванс) у «Sharq» перед «Самарканд Напитки»
  const sharqDrinks = await account(S("sharq"), drinks);
  await debtEntry(sharqDrinks.id, { type: "DEBT_PAYMENT", amount: -(num(sharqDrinks.balance) + 300_000), method: "TRANSFER", comment: "Предоплата за следующие поставки", at: hoursAgo(30), userId: drinks.ownerId });
  // Корректировка: скидка за повреждённую упаковку
  const navruzHome = await account(S("navruz"), home);
  await debtEntry(navruzHome.id, { type: "CORRECTION", amount: -45_000, comment: "Скидка за повреждённую упаковку в прошлой поставке", at: hoursAgo(48), userId: home.ownerId });
}

// ───────────── Замены, бонусы, касса, избранное, антифрод ─────────────

async function extras(sups: Built[], shops: Map<string, BuiltShop>) {
  const sup = (k: string) => sups.find((s) => s.def.key === k)!;
  const food = sup("food"), home = sup("home"), drinks = sup("drinks");

  // Заявка на замену от магазина — на рассмотрении у поставщика
  const item = await db.orderItem.findFirst({
    where: { acceptedQty: { gt: 0 }, productUnit: { product: { allowReplacement: true } }, order: { supplierId: food.id, status: "COMPLETED" } },
    include: { order: true }, orderBy: { createdAt: "desc" },
  });
  if (item) {
    await db.replacement.create({
      data: {
        shopId: item.order.shopId, supplierId: food.id, orderId: item.orderId, orderItemId: item.id, productUnitId: item.productUnitId,
        productName: item.productName, unitLabel: item.unitLabel, qty: 1, reason: "Брак", comment: "Порвана упаковка, часть товара высыпалась",
        photoPaths: [], videoPaths: [], status: "NEW", createdByUserId: shops.get("baraka")!.ownerId, createdAt: hoursAgo(5),
      },
    });
  }
  // Выполненная замена у «Тоза Уй»: брак забран и ждёт проверки в «Возвращённых товарах»
  const homeItem = await db.orderItem.findFirst({
    where: { acceptedQty: { gt: 0 }, productUnit: { product: { allowReplacement: true } }, order: { supplierId: home.id, status: "COMPLETED" } },
    include: { order: true }, orderBy: { createdAt: "asc" },
  });
  if (homeItem) {
    const courierId = home.courierIds[0];
    const rep = await db.replacement.create({
      data: {
        shopId: homeItem.order.shopId, supplierId: home.id, orderId: homeItem.orderId, orderItemId: homeItem.id, productUnitId: homeItem.productUnitId,
        productName: homeItem.productName, unitLabel: homeItem.unitLabel, qty: 1, reason: "Протекает флакон", comment: "Крышка треснула",
        photoPaths: [], videoPaths: [], status: "DONE", courierId, decisionComment: "Заменим со следующей доставкой",
        decidedAt: hoursAgo(72), assignedAt: hoursAgo(60), completedAt: hoursAgo(50), createdAt: hoursAgo(80),
      },
    });
    const rel = { entity: "Replacement", id: rep.id };
    await stock(homeItem.productUnitId, "RESERVE", 1, hoursAgo(72), home.ownerId, `Замена №${rep.number} согласована`, rel);
    await stock(homeItem.productUnitId, "REPLACEMENT_OUT", 1, hoursAgo(50), courierId, `Замена №${rep.number} выполнена`, rel);
    await stock(homeItem.productUnitId, "TO_RETURNED", 1, hoursAgo(50), courierId, `Замена №${rep.number}: брак забран`, rel);
    await db.returnedItem.create({
      data: {
        supplierId: home.id, shopId: homeItem.order.shopId, orderId: homeItem.orderId, replacementId: rep.id, productUnitId: homeItem.productUnitId,
        productName: homeItem.productName, unitLabel: homeItem.unitLabel, qty: 1, reason: "Протекает флакон", courierId,
        photoPaths: [], videoPaths: [], createdAt: hoursAgo(50),
      },
    });
  }

  // Бонусы: «10 коробок масла — 1 коробка в подарок», «5 упаковок колы — упаковка лимонада»
  const unit = (s: Built, key: string, i: number) => s.products.get(key)!.units[i].id;
  await db.bonusPromotion.create({ data: { supplierId: food.id, name: "Масло: 10 коробок + 1 в подарок", triggerUnitId: unit(food, "food-oil-sunflower", 1), triggerQty: 10, giftUnitId: unit(food, "food-oil-sunflower", 1), giftQty: 1, repeatable: true, startsAt: hoursAgo(24 * 10), endsAt: hoursAgo(-24 * 20) } });
  await db.bonusPromotion.create({ data: { supplierId: drinks.id, name: "Кола 5 упаковок — лимонад в подарок", triggerUnitId: unit(drinks, "drk-cola", 1), triggerQty: 5, giftUnitId: unit(drinks, "drk-fanta", 1), giftQty: 1, repeatable: false, startsAt: hoursAgo(24 * 5), endsAt: hoursAgo(-24 * 25) } });

  // Антифрод: энергетик подешевел с 17 000 до 11 000 (−35%) — событие ждёт решения администратора
  const energy = unit(drinks, "drk-energy", 0);
  await db.priceHistory.create({ data: { productUnitId: energy, oldPrice: 17000, newPrice: 11000, userId: drinks.ownerId, createdAt: hoursAgo(26) } });
  await db.antifraudEvent.create({ data: { supplierId: drinks.id, productUnitId: energy, oldPrice: 17000, newPrice: 11000, changePct: -35.29, userId: drinks.ownerId, createdAt: hoursAgo(26) } });

  // Касса: доставщик сдал часть наличных три дня назад
  for (const s of [food, drinks]) {
    const courierId = s.courierIds[0];
    const at = hoursAgo(72);
    const got = await db.order.aggregate({ where: { supplierId: s.id, courierId, receivedMethod: "CASH", completedAt: { lt: at } }, _sum: { receivedAmount: true } });
    const onHand = num(got._sum.receivedAmount);
    if (onHand > 0) {
      const amount = Math.round((onHand * 0.8) / 1000) * 1000;
      await db.cashHandover.create({ data: { supplierId: s.id, courierId, amount, onHand, comment: "Сдал наличные в офисе", acceptedByUserId: s.ownerId, createdAt: at } });
    }
  }

  // Избранное «Baraka»
  const baraka = shops.get("baraka")!;
  for (const [s, key] of [[food, "food-rice-devzira"], [food, "food-oil-sunflower"], [food, "food-tea-green"], [drinks, "drk-water-15"], [drinks, "drk-cola"]] as const) {
    await db.favoriteProduct.create({ data: { shopId: baraka.id, productId: s.products.get(key)!.id } });
  }

  // Уведомления о новых заказах — колокольчик у поставщика
  const placed = await db.order.findMany({ where: { supplierId: { in: sups.map((s) => s.id) }, status: "PLACED" }, include: { shop: true } });
  for (const o of placed) {
    const s = sups.find((x) => x.id === o.supplierId)!;
    for (const userId of s.staffIds) {
      await db.notification.create({ data: { userId, type: "order.new", title: `Новый заказ №${o.number}`, body: `${o.shop.name}, ${num(o.total).toLocaleString("ru-RU")} сум`, link: `/supplier/orders/${o.id}`, entity: "Order", entityId: o.id, createdAt: o.placedAt ?? new Date() } });
    }
  }
}

// ───────────── Удаление (--reset) ─────────────

async function reset() {
  const phones = [
    ...SUPPLIERS.flatMap((s) => [s.owner.phone, ...s.admins.map((a) => a.phone), ...s.couriers.map((c) => c.phone)]),
    ...SHOPS.flatMap((s) => [s.owner.phone, ...(s.staff ? [s.staff.phone] : [])]),
    PENDING_SUPPLIER.owner.phone,
  ];
  const suppliers = (await db.supplier.findMany({ where: { inn: { in: [...SUPPLIERS.map((s) => s.inn), PENDING_SUPPLIER.inn] } }, select: { id: true } })).map((s) => s.id);
  const shops = (await db.shopMember.findMany({ where: { role: "OWNER", user: { phone: { in: SHOPS.map((s) => s.owner.phone) } } }, select: { shopId: true } })).map((m) => m.shopId);
  const orderWhere = { OR: [{ supplierId: { in: suppliers } }, { shopId: { in: shops } }] };
  const accountWhere = { OR: [{ supplierId: { in: suppliers } }, { shopId: { in: shops } }] };
  await db.$transaction([
    db.returnedItem.deleteMany({ where: orderWhere }),
    db.replacement.deleteMany({ where: orderWhere }),
    db.debtEntry.deleteMany({ where: { account: accountWhere } }),
    db.shopAccount.deleteMany({ where: accountWhere }),
    db.order.deleteMany({ where: orderWhere }),
    db.bonusPromotion.deleteMany({ where: { supplierId: { in: suppliers } } }),
    db.cashHandover.deleteMany({ where: { supplierId: { in: suppliers } } }),
    db.commissionInvoice.deleteMany({ where: { supplierId: { in: suppliers } } }),
    db.supplier.deleteMany({ where: { id: { in: suppliers } } }),
    db.shop.deleteMany({ where: { id: { in: shops } } }),
    db.user.deleteMany({ where: { phone: { in: phones } } }),
    db.platformSetting.deleteMany({ where: { key: MARKER } }),
  ]);
  console.log(`Удалено: поставщиков ${suppliers.length}, магазинов ${shops.length}`);
}

// ───────────── Запуск ─────────────

function printLogins() {
  const rows: [string, string][] = [];
  for (const s of SUPPLIERS) {
    rows.push([`${s.displayName}: владелец${s.owner.delivers ? " (сам развозит)" : ""}`, s.owner.phone]);
    for (const a of s.admins) rows.push([`${s.displayName}: администратор`, a.phone]);
    for (const c of s.couriers) rows.push([`${s.displayName}: доставщик ${c.name}`, c.phone]);
  }
  rows.push([`${PENDING_SUPPLIER.displayName}: заявка на проверке`, PENDING_SUPPLIER.owner.phone]);
  for (const s of SHOPS) {
    rows.push([`${s.name}: владелец`, s.owner.phone]);
    if (s.staff) rows.push([`${s.name}: продавец`, s.staff.phone]);
  }
  console.log(`\nВход: телефон и пароль ${PASSWORD}`);
  for (const [who, phone] of rows) console.log(`  ${phone}  ${who}`);
  console.log(`  Супер-администратор: ${process.env.SUPERADMIN_PHONE ?? "+998900000000"} (пароль ваш)`);
}

async function main() {
  await territory("г. Ташкент");
  const done = await db.platformSetting.findUnique({ where: { key: MARKER } });
  const started = await db.supplier.findUnique({ where: { inn: SUPPLIERS[0].inn } });
  // Прошлый запуск прервался на середине — данные неполные, создаём заново
  if (RESET || (started && !done)) await reset();
  else if (done) {
    console.log("Тестовые данные уже есть. Пересоздать: npm run seed:demo -- --reset");
    printLogins();
    return;
  }
  passwordHash = await bcrypt.hash(PASSWORD, 12);
  const rate = num((await db.platformSetting.findUnique({ where: { key: "defaultCommissionRate" } }))?.value as number | null) || 3;

  const sups: Built[] = [];
  for (const def of SUPPLIERS) {
    sups.push(await createSupplier(def, rate));
    console.log(`Поставщик «${def.displayName}»: ${def.products.length} товаров`);
  }
  const shops = new Map<string, BuiltShop>();
  for (const def of SHOPS) shops.set(def.key, await createShop(def));
  console.log(`Магазинов: ${shops.size}`);

  // Заявка на модерации
  const pendingOwner = await user(PENDING_SUPPLIER.owner.phone, PENDING_SUPPLIER.owner.name);
  const fergana = await territory("Ферганская область", "Фергана");
  const pending = await db.supplier.create({
    data: {
      legalName: PENDING_SUPPLIER.legalName, displayName: PENDING_SUPPLIER.displayName, inn: PENDING_SUPPLIER.inn,
      legalAddress: PENDING_SUPPLIER.legalAddress, phone: PENDING_SUPPLIER.owner.phone, extraPhones: [], email: PENDING_SUPPLIER.email,
      contactPerson: PENDING_SUPPLIER.owner.name, description: PENDING_SUPPLIER.description,
      officeTerritoryId: fergana.id, officeAddress: PENDING_SUPPLIER.officeAddress, officeLat: 40.3864, officeLng: 71.7864,
      status: "PENDING", createdAt: hoursAgo(20),
      statusHistory: { create: { toStatus: "PENDING", comment: "Заявка подана", createdAt: hoursAgo(20) } },
      members: { create: { userId: pendingOwner.id, role: "OWNER" } },
      territories: { create: { territoryId: (await territory("Ферганская область")).id } },
    },
  });
  void pending;

  await fillOrders(sups, shops);
  await extras(sups, shops);

  console.log("Заказы по статусам:", Object.entries(counts).filter(([, n]) => n > 0).map(([s, n]) => `${s} ${n}`).join(", "));
  await db.platformSetting.upsert({ where: { key: MARKER }, update: { value: new Date().toISOString() }, create: { key: MARKER, value: new Date().toISOString() } });
  printLogins();
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });

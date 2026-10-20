"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { notifySupplierStaff, notifyUsers } from "@/lib/notify";
import { invalid, opt, parseForm, req, type FormState } from "@/lib/forms";
import {
  SUPPLIER_ACTION_NEEDS_COMMENT,
  SUPPLIER_STATUS_LABEL,
  SHOP_STATUS_LABEL,
  supplierTransition,
  type SupplierModerationAction,
} from "@/lib/statuses";
import type { ShopStatus } from "@/generated/prisma/enums";

// ───────────── Модерация поставщиков (ТЗ п. 8) ─────────────

const moderationSchema = z.object({
  supplierId: req(),
  action: z.enum(["approve", "reject", "request_info", "block", "unblock"]),
  comment: opt(),
});

export async function moderateSupplierAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const auth = await requireSuperAdmin();
  const parsed = parseForm(moderationSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const { supplierId, action, comment } = parsed.data;
  if (SUPPLIER_ACTION_NEEDS_COMMENT.includes(action) && !comment) {
    return { fieldErrors: { comment: ["Укажите причину — её увидит поставщик"] } };
  }
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return { error: "Поставщик не найден" };
  const to = supplierTransition(action as SupplierModerationAction, supplier.status);
  if (!to) return { error: `Действие недоступно в статусе «${SUPPLIER_STATUS_LABEL[supplier.status]}»` };

  await db.$transaction(async (tx) => {
    await tx.supplier.update({
      where: { id: supplierId },
      data: {
        status: to,
        moderationComment: action === "approve" || action === "unblock" ? null : comment,
        approvedAt: action === "approve" ? new Date() : undefined,
      },
    });
    await tx.supplierStatusHistory.create({
      data: { supplierId, fromStatus: supplier.status, toStatus: to, comment, userId: auth.realUser.id },
    });
    await writeAudit(
      {
        entity: "Supplier",
        entityId: supplierId,
        action: `moderation.${action}`,
        actorRole: "SUPER_ADMIN",
        supplierId,
        comment,
        changes: [{ field: "status", old: supplier.status, new: to }],
      },
      tx,
    );
    await notifySupplierStaff(
      supplierId,
      {
        type: "supplier.status",
        title: `Статус компании: ${SUPPLIER_STATUS_LABEL[to]}`,
        body: comment,
        link: "/supplier",
        entity: "Supplier",
        entityId: supplierId,
      },
      ["OWNER", "ADMIN"],
      tx,
    );
  });
  revalidatePath(`/admin/suppliers/${supplierId}`);
  return { ok: true, message: `Статус изменён: ${SUPPLIER_STATUS_LABEL[to]}` };
}

// ───────────── Комиссия (ТЗ п. 52) ─────────────

const rate = z.coerce.number({ error: "Число от 0 до 100" }).min(0, "Не меньше 0").max(100, "Не больше 100");

const commissionSchema = z.object({ supplierId: req(), commissionRate: opt() });

export async function setSupplierCommissionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const parsed = parseForm(commissionSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const { supplierId } = parsed.data;
  let value: number | null = null;
  if (parsed.data.commissionRate !== undefined) {
    const r = rate.safeParse(parsed.data.commissionRate.replace(",", "."));
    if (!r.success) return { fieldErrors: { commissionRate: [r.error.issues[0].message] } };
    value = r.data;
  }
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return { error: "Поставщик не найден" };
  await db.supplier.update({ where: { id: supplierId }, data: { commissionRate: value } });
  await writeAudit({
    entity: "Supplier",
    entityId: supplierId,
    action: "commission.update",
    actorRole: "SUPER_ADMIN",
    supplierId,
    changes: [{ field: "commissionRate", old: supplier.commissionRate?.toString() ?? null, new: value }],
  });
  revalidatePath(`/admin/suppliers/${supplierId}`);
  return { ok: true, message: value === null ? "Действует стандартная ставка" : `Индивидуальная ставка ${value}%` };
}

export async function setDefaultCommissionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const r = rate.safeParse(String(formData.get("rate") ?? "").replace(",", "."));
  if (!r.success) return { fieldErrors: { rate: [r.error.issues[0].message] } };
  const prev = await db.platformSetting.findUnique({ where: { key: "defaultCommissionRate" } });
  await db.platformSetting.upsert({
    where: { key: "defaultCommissionRate" },
    update: { value: r.data },
    create: { key: "defaultCommissionRate", value: r.data },
  });
  await writeAudit({
    entity: "PlatformSetting",
    entityId: "defaultCommissionRate",
    action: "update",
    actorRole: "SUPER_ADMIN",
    changes: [{ field: "defaultCommissionRate", old: prev?.value ?? null, new: r.data }],
  });
  revalidatePath("/admin/settings");
  return { ok: true, message: `Стандартная комиссия: ${r.data}%` };
}

// ───────────── Магазины (ТЗ п. 13) ─────────────

const shopStatusSchema = z.object({
  shopId: req(),
  status: z.enum(["NEW", "VERIFIED", "FAILED_CHECK"]),
  reason: req("Укажите причину"),
});

export async function setShopStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const auth = await requireSuperAdmin();
  const parsed = parseForm(shopStatusSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const { shopId, status, reason } = parsed.data;
  const shop = await db.shop.findUnique({ where: { id: shopId }, include: { members: true } });
  if (!shop) return { error: "Магазин не найден" };
  if (shop.status === status) return { error: "Магазин уже в этом статусе" };
  await db.$transaction(async (tx) => {
    await tx.shop.update({ where: { id: shopId }, data: { status: status as ShopStatus } });
    await tx.shopStatusHistory.create({
      data: { shopId, fromStatus: shop.status, toStatus: status as ShopStatus, reason, userId: auth.realUser.id },
    });
    await writeAudit(
      { entity: "Shop", entityId: shopId, action: "status.update", actorRole: "SUPER_ADMIN", shopId, comment: reason, changes: [{ field: "status", old: shop.status, new: status }] },
      tx,
    );
    await notifyUsers(
      shop.members.filter((m) => m.isActive).map((m) => m.userId),
      { type: "shop.status", title: `Статус магазина: ${SHOP_STATUS_LABEL[status as ShopStatus]}`, body: reason, link: "/shop/profile", entity: "Shop", entityId: shopId },
      tx,
    );
  });
  revalidatePath(`/admin/shops/${shopId}`);
  return { ok: true, message: "Статус изменён" };
}

export async function toggleShopBlockAction(formData: FormData) {
  await requireSuperAdmin();
  const shopId = String(formData.get("shopId") ?? "");
  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) return;
  await db.shop.update({ where: { id: shopId }, data: { isBlocked: !shop.isBlocked } });
  await writeAudit({
    entity: "Shop",
    entityId: shopId,
    action: shop.isBlocked ? "unblock" : "block",
    actorRole: "SUPER_ADMIN",
    shopId,
    changes: [{ field: "isBlocked", old: shop.isBlocked, new: !shop.isBlocked }],
  });
  revalidatePath(`/admin/shops/${shopId}`);
}

// ───────────── Территории (ТЗ п. 10) ─────────────

const territorySchema = z.object({
  parentId: req("Выберите родительскую территорию"),
  name: req(),
  type: z.enum(["REGION", "CITY", "DISTRICT"]),
});

export async function addTerritoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const parsed = parseForm(territorySchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const { parentId, name, type } = parsed.data;
  const parent = await db.territory.findUnique({ where: { id: parentId } });
  if (!parent) return { error: "Родительская территория не найдена" };
  if (await db.territory.findFirst({ where: { parentId, name } })) return { fieldErrors: { name: ["Такая территория уже есть"] } };
  const t = await db.territory.create({ data: { parentId, name, type } });
  await writeAudit({ entity: "Territory", entityId: t.id, action: "create", actorRole: "SUPER_ADMIN", changes: [{ field: "name", old: null, new: name }] });
  revalidatePath("/admin/territories");
  return { ok: true, message: `Добавлено: ${name}` };
}

export async function toggleTerritoryAction(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const t = await db.territory.findUnique({ where: { id } });
  if (!t) return;
  await db.territory.update({ where: { id }, data: { isActive: !t.isActive } });
  await writeAudit({ entity: "Territory", entityId: id, action: t.isActive ? "deactivate" : "activate", actorRole: "SUPER_ADMIN", changes: [{ field: "isActive", old: t.isActive, new: !t.isActive }] });
  revalidatePath("/admin/territories");
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { parseAmount } from "@/lib/catalog";
import { validQty } from "@/lib/order-core";
import { formValues, invalid, parseForm, req, success, type FormState } from "@/lib/forms";

function roleTag(role: string) {
  return role === "OWNER" ? "SUPPLIER_OWNER" : "SUPPLIER_ADMIN";
}

const schema = z.object({
  name: req("Введите название акции"),
  triggerUnitId: req("Выберите основной товар"),
  triggerQty: req("Укажите количество"),
  giftUnitId: req("Выберите подарок"),
  giftQty: req("Укажите количество"),
  startsAt: req("Укажите дату начала"),
  endsAt: req("Укажите дату окончания"),
});

// Даты акции — по времени Ташкента: с начала первого дня до конца последнего
const dayStart = (d: string) => new Date(`${d}T00:00:00+05:00`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+05:00`);

export async function createBonusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const parsed = parseForm(schema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const values = formValues(formData);
  const units = await db.productUnit.findMany({ where: { id: { in: [d.triggerUnitId, d.giftUnitId] }, product: { supplierId: ctx.supplier.id } } });
  const trigger = units.find((u) => u.id === d.triggerUnitId);
  const gift = units.find((u) => u.id === d.giftUnitId);
  if (!trigger || !gift) return { error: "Товар не найден", values };
  const triggerQty = parseAmount(d.triggerQty);
  const giftQty = parseAmount(d.giftQty);
  const fieldErrors: Record<string, string[]> = {};
  if (triggerQty === null || !validQty(trigger.kind, triggerQty)) fieldErrors.triggerQty = ["Неверное количество"];
  if (giftQty === null || !validQty(gift.kind, giftQty)) fieldErrors.giftQty = ["Неверное количество"];
  const startsAt = dayStart(d.startsAt);
  const endsAt = dayEnd(d.endsAt);
  if (Number.isNaN(startsAt.getTime())) fieldErrors.startsAt = ["Неверная дата"];
  if (Number.isNaN(endsAt.getTime()) || endsAt < startsAt) fieldErrors.endsAt = ["Окончание раньше начала"];
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values };
  const promo = await db.bonusPromotion.create({
    data: {
      supplierId: ctx.supplier.id,
      name: d.name,
      triggerUnitId: trigger.id,
      triggerQty: triggerQty!,
      giftUnitId: gift.id,
      giftQty: giftQty!,
      repeatable: formData.get("repeatable") === "on",
      startsAt,
      endsAt,
    },
  });
  await writeAudit({ entity: "BonusPromotion", entityId: promo.id, action: "create", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, changes: [{ field: "name", old: null, new: d.name }] });
  revalidatePath("/supplier/bonuses");
  return success(`Акция «${d.name}» создана`);
}

export async function toggleBonusAction(formData: FormData) {
  const ctx = await requireActiveSupplier();
  const promo = await db.bonusPromotion.findUnique({ where: { id: String(formData.get("id") ?? "") } });
  if (!promo || promo.supplierId !== ctx.supplier.id) return;
  await db.bonusPromotion.update({ where: { id: promo.id }, data: { isActive: !promo.isActive } });
  await writeAudit({ entity: "BonusPromotion", entityId: promo.id, action: promo.isActive ? "deactivate" : "activate", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, changes: [{ field: "isActive", old: promo.isActive, new: !promo.isActive }] });
  revalidatePath("/supplier/bonuses");
}

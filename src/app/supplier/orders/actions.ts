"use server";

import { revalidatePath } from "next/cache";
import { requireActiveSupplier } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { parseAmount } from "@/lib/catalog";
import { addForcedItem, assignCourier, OrderError, removeForcedItem, supplierOrderAction } from "@/lib/orders";
import { ORDER_STATUS_LABEL, SUPPLIER_ACTION_NEEDS_REASON, type SupplierOrderAction } from "@/lib/order-core";
import { formValues, success, type FormState } from "@/lib/forms";

const ACTIONS: SupplierOrderAction[] = ["accept", "assemble", "ready", "reject", "cancel"];

function roleTag(role: string) {
  return role === "OWNER" ? "SUPPLIER_OWNER" : "SUPPLIER_ADMIN";
}

function fail(e: unknown, formData: FormData): FormState {
  if (e instanceof OrderError) return { error: e.message, values: formValues(formData) };
  throw e;
}

export async function orderStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const orderId = String(formData.get("orderId") ?? "");
  const action = String(formData.get("action") ?? "") as SupplierOrderAction;
  if (!ACTIONS.includes(action)) return { error: "Неизвестное действие" };
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (SUPPLIER_ACTION_NEEDS_REASON.includes(action) && !reason) {
    return { fieldErrors: { reason: ["Укажите причину — её увидит магазин"] }, values: formValues(formData) };
  }
  let to;
  try {
    to = await supplierOrderAction(ctx.supplier.id, orderId, action, reason, roleTag(ctx.membership.role));
  } catch (e) {
    return fail(e, formData);
  }
  await writeAudit({ entity: "Order", entityId: orderId, action: `status.${action}`, actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, comment: reason, changes: [{ field: "status", old: null, new: to }] });
  revalidatePath("/supplier", "layout");
  return success(`Статус: ${ORDER_STATUS_LABEL[to]}`);
}

export async function assignCourierAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const orderId = String(formData.get("orderId") ?? "");
  const courierId = String(formData.get("courierId") ?? "") || null;
  try {
    await assignCourier(ctx.supplier.id, orderId, courierId, roleTag(ctx.membership.role));
  } catch (e) {
    return fail(e, formData);
  }
  await writeAudit({ entity: "Order", entityId: orderId, action: courierId ? "courier.assign" : "courier.unassign", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, changes: [{ field: "courierId", old: null, new: courierId }] });
  revalidatePath("/supplier", "layout");
  return success(courierId ? "Доставщик назначен" : "Доставщик снят");
}

export async function addForcedAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const orderId = String(formData.get("orderId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  const qty = parseAmount(String(formData.get("qty") ?? ""));
  if (!unitId) return { fieldErrors: { unitId: ["Выберите товар"] }, values: formValues(formData) };
  if (qty === null || qty <= 0) return { fieldErrors: { qty: ["Укажите количество"] }, values: formValues(formData) };
  try {
    await addForcedItem(ctx.supplier.id, orderId, unitId, qty, roleTag(ctx.membership.role));
  } catch (e) {
    return fail(e, formData);
  }
  await writeAudit({ entity: "Order", entityId: orderId, action: "item.forced_add", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, changes: [{ field: "item", old: null, new: { unitId, qty } }] });
  revalidatePath("/supplier", "layout");
  return success("Позиция добавлена и зарезервирована");
}

export async function removeForcedAction(formData: FormData) {
  const ctx = await requireActiveSupplier();
  const itemId = String(formData.get("itemId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  try {
    await removeForcedItem(ctx.supplier.id, itemId, roleTag(ctx.membership.role));
  } catch (e) {
    if (e instanceof OrderError) return;
    throw e;
  }
  await writeAudit({ entity: "Order", entityId: orderId, action: "item.forced_remove", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, changes: [{ field: "item", old: itemId, new: null }] });
  revalidatePath("/supplier", "layout");
}

"use server";

import { revalidatePath } from "next/cache";
import { requireActiveSupplier } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { parseAmount, parseSignedAmount } from "@/lib/catalog";
import { correctBalance, decideCancelRequest, resolveProblem } from "@/lib/delivery";
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

export async function cancelRequestDecisionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const orderId = String(formData.get("orderId") ?? "");
  const approve = formData.get("decision") === "approve";
  const comment = String(formData.get("comment") ?? "").trim() || null;
  try {
    await decideCancelRequest(ctx.supplier.id, orderId, approve, comment, roleTag(ctx.membership.role));
  } catch (e) {
    return fail(e, formData);
  }
  await writeAudit({ entity: "Order", entityId: orderId, action: approve ? "cancel.approve" : "cancel.decline", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, comment });
  revalidatePath("/supplier", "layout");
  return success(approve ? "Отмена согласована, резерв освобождён" : "В отмене отказано, доставка продолжается");
}

export async function resolveProblemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const orderId = String(formData.get("orderId") ?? "");
  const resolution = String(formData.get("resolution") ?? "") as "continue" | "back_to_ready" | "cancel";
  if (!["continue", "back_to_ready", "cancel"].includes(resolution)) return { error: "Неизвестное действие" };
  const comment = String(formData.get("comment") ?? "").trim() || null;
  try {
    await resolveProblem(ctx.supplier.id, orderId, resolution, comment, roleTag(ctx.membership.role));
  } catch (e) {
    return fail(e, formData);
  }
  await writeAudit({ entity: "Order", entityId: orderId, action: `problem.${resolution}`, actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, comment });
  revalidatePath("/supplier", "layout");
  return success("Решение сохранено");
}

export async function orderCorrectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier(["OWNER", "ADMIN"]);
  const orderId = String(formData.get("orderId") ?? "");
  const shopId = String(formData.get("shopId") ?? "");
  const amount = parseSignedAmount(String(formData.get("amount") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim();
  if (amount === null || amount === 0) return { fieldErrors: { amount: ["Укажите сумму со знаком, например +200 или -500"] }, values: formValues(formData) };
  if (!reason) return { fieldErrors: { reason: ["Укажите основание"] }, values: formValues(formData) };
  try {
    await correctBalance(ctx.supplier.id, shopId, amount, reason, orderId || null, roleTag(ctx.membership.role));
  } catch (e) {
    return fail(e, formData);
  }
  await writeAudit({ entity: orderId ? "Order" : "ShopAccount", entityId: orderId || shopId, action: "correction", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, shopId, comment: reason, changes: [{ field: "amount", old: null, new: amount }] });
  revalidatePath("/supplier", "layout");
  return success("Корректирующая операция записана");
}

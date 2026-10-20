"use server";

import { revalidatePath } from "next/cache";
import { requireActiveSupplier } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { OrderError } from "@/lib/orders";
import { assignReplacement, decideReplacement, setReturnedStatus } from "@/lib/replacements";
import { RETURNED_STATUS_LABEL } from "@/lib/replacement-core";
import { formValues, success, type FormState } from "@/lib/forms";
import { StockError } from "@/lib/stock";
import type { ReturnedStatus } from "@/generated/prisma/enums";

function roleTag(role: string) {
  return role === "OWNER" ? "SUPPLIER_OWNER" : "SUPPLIER_ADMIN";
}

function fail(e: unknown, formData: FormData): FormState {
  if (e instanceof OrderError || e instanceof StockError) return { error: e.message, values: formValues(formData) };
  throw e;
}

export async function decideReplacementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const id = String(formData.get("id") ?? "");
  const approve = formData.get("decision") === "approve";
  const comment = String(formData.get("comment") ?? "").trim() || null;
  if (!approve && !comment) return { fieldErrors: { comment: ["Укажите причину отказа"] }, values: formValues(formData) };
  try {
    await decideReplacement(ctx.supplier.id, id, approve, comment);
  } catch (e) {
    return fail(e, formData);
  }
  await writeAudit({ entity: "Replacement", entityId: id, action: approve ? "approve" : "reject", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, comment });
  revalidatePath("/supplier/replacements", "layout");
  return success(approve ? "Замена согласована, товар зарезервирован" : "Заявка отклонена");
}

export async function assignReplacementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const id = String(formData.get("id") ?? "");
  const courierId = String(formData.get("courierId") ?? "") || undefined;
  const orderId = String(formData.get("orderId") ?? "") || undefined;
  if (!courierId && !orderId) return { error: "Выберите доставщика или заказ" };
  try {
    await assignReplacement(ctx.supplier.id, id, orderId ? { orderId } : { courierId });
  } catch (e) {
    return fail(e, formData);
  }
  await writeAudit({ entity: "Replacement", entityId: id, action: "assign", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, changes: [{ field: orderId ? "newOrderId" : "courierId", old: null, new: orderId ?? courierId }] });
  revalidatePath("/supplier/replacements", "layout");
  return success("Замена назначена");
}

export async function returnedStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as ReturnedStatus;
  if (!(status in RETURNED_STATUS_LABEL)) return { error: "Неизвестный статус" };
  const comment = String(formData.get("comment") ?? "").trim() || null;
  let before;
  try {
    before = await setReturnedStatus(ctx.supplier.id, id, status, comment);
  } catch (e) {
    return fail(e, formData);
  }
  await writeAudit({ entity: "ReturnedItem", entityId: id, action: "status", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, comment, changes: [{ field: "status", old: before.status, new: status }] });
  revalidatePath("/supplier/returned");
  return success(`Статус: ${RETURNED_STATUS_LABEL[status]}`);
}

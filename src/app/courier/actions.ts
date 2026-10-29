"use server";

import { revalidatePath } from "next/cache";
import { requireDeliverer } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { parseAmount } from "@/lib/catalog";
import { confirmDelivery, markNotDelivered, reportProblem, startDelivery } from "@/lib/delivery";
import { OrderError } from "@/lib/orders";
import { formatMoney } from "@/lib/format";
import { formValues, success, type FormState } from "@/lib/forms";
import { StockError } from "@/lib/stock";
import { isProblemReason, problemText } from "@/lib/order-core";
import { realFiles, saveImage, UploadError } from "@/lib/storage";
import { moveInRoute, resetRoute } from "@/lib/route";
import { actorRoleTag } from "@/lib/supplier-roles";

function fail(e: unknown, formData: FormData): FormState {
  if (e instanceof OrderError || e instanceof StockError) return { error: e.message, values: formValues(formData) };
  throw e;
}

async function courier() {
  const ctx = await requireDeliverer();
  return { ctx, courierId: ctx.auth.user.id, actorRole: actorRoleTag(ctx.membership.role) };
}

export async function startDeliveryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, courierId, actorRole } = await courier();
  const orderId = String(formData.get("orderId") ?? "");
  try {
    await startDelivery(courierId, orderId);
  } catch (e) {
    return fail(e, formData);
  }
  await writeAudit({ entity: "Order", entityId: orderId, action: "delivery.start", actorRole, supplierId: ctx.supplier.id });
  revalidatePath("/courier", "layout");
  return success("Отмечено: заказ в пути");
}

export async function problemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, courierId, actorRole } = await courier();
  const orderId = String(formData.get("orderId") ?? "");
  const kind = String(formData.get("kind") ?? "problem");
  const reason = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!isProblemReason(reason)) return { fieldErrors: { reason: ["Выберите причину"] }, values: formValues(formData) };
  if (reason === "OTHER" && !note) return { fieldErrors: { note: ["Опишите, что случилось"] }, values: formValues(formData) };
  let photoPaths: string[];
  try {
    photoPaths = await Promise.all(realFiles(formData, "photos", 3).map((f) => saveImage(f, "problems")));
  } catch (e) {
    if (e instanceof UploadError) return { fieldErrors: { photos: [e.message] }, values: formValues(formData) };
    throw e;
  }
  try {
    if (kind === "not_delivered") await markNotDelivered(courierId, orderId, { reason, note, photoPaths });
    else await reportProblem(courierId, orderId, { reason, note, photoPaths });
  } catch (e) {
    return fail(e, formData);
  }
  const text = problemText(reason, note);
  await writeAudit({ entity: "Order", entityId: orderId, action: kind === "not_delivered" ? "delivery.not_delivered" : "delivery.problem", actorRole, supplierId: ctx.supplier.id, comment: text });
  revalidatePath("/courier", "layout");
  return success(kind === "not_delivered" ? "Заказ отмечен как недоставленный, товар вернётся на склад" : "Поставщик получил сообщение о проблеме");
}

export async function confirmDeliveryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, courierId, actorRole } = await courier();
  const orderId = String(formData.get("orderId") ?? "");
  const ids = formData.getAll("itemId").map(String);
  const items = [];
  for (const id of ids) {
    const delivered = parseAmount(String(formData.get(`delivered_${id}`) ?? ""));
    const accepted = parseAmount(String(formData.get(`accepted_${id}`) ?? ""));
    if (delivered === null || accepted === null) return { error: "Укажите доставленное и принятое количество по всем позициям", values: formValues(formData) };
    items.push({ id, delivered, accepted });
  }
  const received = parseAmount(String(formData.get("received") ?? "0")) ?? NaN;
  const method = String(formData.get("method") ?? "CASH") as "CASH" | "CARD" | "TRANSFER";
  const qr = String(formData.get("qr") ?? "");
  if (!qr.trim()) return { error: "Отсканируйте QR магазина или введите код под ним", values: formValues(formData) };
  let r;
  try {
    r = await confirmDelivery(courierId, orderId, { items, received, method, qr });
  } catch (e) {
    return fail(e, formData);
  }
  if (r.already) return success("Эта приёмка уже была отправлена и проведена");
  await writeAudit({ entity: "Order", entityId: orderId, action: "delivery.confirm", actorRole, supplierId: ctx.supplier.id, changes: [{ field: "status", old: "IN_TRANSIT", new: r.status }, { field: "receivedAmount", old: null, new: received }] });
  revalidatePath("/courier", "layout");
  return success(`Получение подтверждено. Сумма заказа ${formatMoney(r.total)}${r.orderDebt > 0 ? `, долг по заказу ${formatMoney(r.orderDebt)}` : ""}`);
}

// Д2: порядок объезда на сегодня
export async function moveRouteAction(formData: FormData) {
  const { ctx, courierId } = await courier();
  const dir = formData.get("dir") === "up" ? -1 : 1;
  try {
    await moveInRoute(ctx.supplier.id, courierId, String(formData.get("orderId") ?? ""), dir);
  } catch (e) {
    if (!(e instanceof OrderError)) throw e;
  }
  revalidatePath("/courier");
}

export async function resetRouteAction() {
  const { ctx, courierId } = await courier();
  await resetRoute(ctx.supplier.id, courierId);
  revalidatePath("/courier");
}

"use server";

import { revalidatePath } from "next/cache";
import { requireSupplier } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { parseAmount } from "@/lib/catalog";
import { confirmDelivery, markNotDelivered, reportProblem, startDelivery } from "@/lib/delivery";
import { OrderError } from "@/lib/orders";
import { formatMoney } from "@/lib/format";
import { formValues, success, type FormState } from "@/lib/forms";
import { StockError } from "@/lib/stock";

function fail(e: unknown, formData: FormData): FormState {
  if (e instanceof OrderError || e instanceof StockError) return { error: e.message, values: formValues(formData) };
  throw e;
}

async function courier() {
  const ctx = await requireSupplier(["COURIER"]);
  return { ctx, courierId: ctx.auth.user.id };
}

export async function startDeliveryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, courierId } = await courier();
  const orderId = String(formData.get("orderId") ?? "");
  try {
    await startDelivery(courierId, orderId);
  } catch (e) {
    return fail(e, formData);
  }
  await writeAudit({ entity: "Order", entityId: orderId, action: "delivery.start", actorRole: "COURIER", supplierId: ctx.supplier.id });
  revalidatePath("/courier", "layout");
  return success("Отмечено: заказ в пути");
}

export async function problemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, courierId } = await courier();
  const orderId = String(formData.get("orderId") ?? "");
  const kind = String(formData.get("kind") ?? "problem");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { fieldErrors: { note: ["Опишите, что случилось"] }, values: formValues(formData) };
  try {
    if (kind === "not_delivered") await markNotDelivered(courierId, orderId, note);
    else await reportProblem(courierId, orderId, note);
  } catch (e) {
    return fail(e, formData);
  }
  await writeAudit({ entity: "Order", entityId: orderId, action: kind === "not_delivered" ? "delivery.not_delivered" : "delivery.problem", actorRole: "COURIER", supplierId: ctx.supplier.id, comment: note });
  revalidatePath("/courier", "layout");
  return success(kind === "not_delivered" ? "Заказ отмечен как недоставленный, товар вернётся на склад" : "Поставщик получил сообщение о проблеме");
}

export async function confirmDeliveryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, courierId } = await courier();
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
  await writeAudit({ entity: "Order", entityId: orderId, action: "delivery.confirm", actorRole: "COURIER", supplierId: ctx.supplier.id, changes: [{ field: "status", old: "IN_TRANSIT", new: r.status }, { field: "receivedAmount", old: null, new: received }] });
  revalidatePath("/courier", "layout");
  return success(`Получение подтверждено. Сумма заказа ${formatMoney(r.total)}${r.orderDebt > 0 ? `, долг по заказу ${formatMoney(r.orderDebt)}` : ""}`);
}

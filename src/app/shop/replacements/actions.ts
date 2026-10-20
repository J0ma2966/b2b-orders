"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireShop } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { parseAmount } from "@/lib/catalog";
import { OrderError } from "@/lib/orders";
import { cancelReplacement, createReplacement } from "@/lib/replacements";
import { REPLACEMENT_REASONS } from "@/lib/replacement-core";
import { isRealFile, saveImage, saveVideo, UploadError } from "@/lib/storage";
import { formValues, type FormState } from "@/lib/forms";

export async function createReplacementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireShop();
  const values = formValues(formData);
  const orderId = String(formData.get("orderId") ?? "");
  const orderItemId = String(formData.get("orderItemId") ?? "");
  const qty = parseAmount(String(formData.get("qty") ?? ""));
  const reason = String(formData.get("reason") ?? "");
  const comment = String(formData.get("comment") ?? "").trim() || null;
  const fieldErrors: Record<string, string[]> = {};
  if (!orderItemId) fieldErrors.orderItemId = ["Выберите товар"];
  if (qty === null || qty <= 0) fieldErrors.qty = ["Укажите количество"];
  if (!REPLACEMENT_REASONS.includes(reason)) fieldErrors.reason = ["Выберите причину"];
  if (reason === "Другое" && !comment) fieldErrors.comment = ["Опишите причину"];
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values };
  let id: string;
  try {
    const photoPaths: string[] = [];
    for (const f of formData.getAll("photos")) if (isRealFile(f)) photoPaths.push(await saveImage(f, "replacements"));
    const videoPaths: string[] = [];
    for (const f of formData.getAll("videos")) if (isRealFile(f)) videoPaths.push(await saveVideo(f, "replacements"));
    const r = await createReplacement(ctx.shop.id, { orderId, orderItemId, qty: qty!, reason, comment, photoPaths, videoPaths });
    id = r.id;
  } catch (e) {
    if (e instanceof OrderError || e instanceof UploadError) return { error: e.message, values };
    throw e;
  }
  await writeAudit({ entity: "Replacement", entityId: id, action: "create", actorRole: "SHOP", shopId: ctx.shop.id, changes: [{ field: "qty", old: null, new: qty }, { field: "reason", old: null, new: reason }] });
  revalidatePath("/shop/replacements");
  redirect("/shop/replacements?created=1");
}

export async function cancelReplacementAction(formData: FormData) {
  const ctx = await requireShop();
  const id = String(formData.get("id") ?? "");
  try {
    await cancelReplacement(ctx.shop.id, id);
  } catch (e) {
    if (e instanceof OrderError) return;
    throw e;
  }
  await writeAudit({ entity: "Replacement", entityId: id, action: "cancel", actorRole: "SHOP", shopId: ctx.shop.id });
  revalidatePath("/shop/replacements");
}

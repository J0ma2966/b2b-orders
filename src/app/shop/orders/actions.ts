"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireShop } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { addToCart, cancelByShop, checkout, OrderError, setCartQty } from "@/lib/orders";
import { parseAmount } from "@/lib/catalog";
import { normalizePhone } from "@/lib/phone";
import { formValues, invalid, opt, parseForm, req, success, type FormState } from "@/lib/forms";
import { formatQty } from "@/lib/catalog";

function fail(e: unknown, formData?: FormData): FormState {
  if (e instanceof OrderError) return { error: e.message, values: formData ? formValues(formData) : undefined };
  throw e;
}

export async function addToCartAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireShop();
  const supplierId = String(formData.get("supplierId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  const qty = parseAmount(String(formData.get("qty") ?? ""));
  if (qty === null || qty <= 0) return { error: "Укажите количество" };
  try {
    const r = await addToCart(ctx.shop, supplierId, unitId, qty);
    revalidatePath("/shop", "layout");
    return success(`Добавлено в корзину. Всего этой позиции: ${formatQty(r.qty)}`);
  } catch (e) {
    return fail(e);
  }
}

export async function setCartQtyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireShop();
  const itemId = String(formData.get("itemId") ?? "");
  const remove = formData.get("$remove") !== null || formData.get("remove") === "1";
  const qty = remove ? 0 : parseAmount(String(formData.get("qty") ?? ""));
  if (qty === null || qty < 0) return { error: "Укажите количество" };
  try {
    await setCartQty(ctx.shop.id, itemId, qty);
    revalidatePath("/shop", "layout");
    return success(qty === 0 ? "Позиция убрана" : "Количество изменено");
  } catch (e) {
    return fail(e);
  }
}

const checkoutSchema = z.object({
  supplierId: req(),
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER"], { error: "Выберите способ оплаты" }),
  deliveryAddress: req("Укажите адрес доставки"),
  contactName: req("Укажите контактное лицо"),
  contactPhone: req("Укажите телефон"),
  deliveryDate: opt(),
  comment: opt(),
});

export async function checkoutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireShop();
  const parsed = parseForm(checkoutSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const phone = normalizePhone(d.contactPhone);
  if (!phone) return { fieldErrors: { contactPhone: ["Неверный номер телефона"] }, values: formValues(formData) };
  let deliveryDate: Date | null = null;
  if (d.deliveryDate) {
    deliveryDate = new Date(`${d.deliveryDate}T00:00:00Z`);
    const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" }) + "T00:00:00Z");
    if (Number.isNaN(deliveryDate.getTime()) || deliveryDate < today) {
      return { fieldErrors: { deliveryDate: ["Дата не может быть в прошлом"] }, values: formValues(formData) };
    }
  }
  let result;
  try {
    result = await checkout(ctx.shop, d.supplierId, {
      paymentMethod: d.paymentMethod,
      comment: d.comment,
      deliveryAddress: d.deliveryAddress,
      contactName: d.contactName,
      contactPhone: phone,
      deliveryDate,
    });
  } catch (e) {
    return fail(e, formData);
  }
  revalidatePath("/shop", "layout");
  if (!result.placed) {
    return {
      error: "Пока вы оформляли заказ, данные изменились. Корзина обновлена, проверьте её и оформите ещё раз:",
      details: result.changes,
      values: formValues(formData),
    };
  }
  await writeAudit({ entity: "Order", entityId: result.orderId, action: "place", actorRole: "SHOP", shopId: ctx.shop.id, supplierId: d.supplierId });
  redirect(`/shop/orders/${result.orderId}?placed=1`);
}

export async function cancelOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireShop();
  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { fieldErrors: { reason: ["Укажите причину отмены"] } };
  try {
    await cancelByShop(ctx.shop.id, orderId, reason);
  } catch (e) {
    return fail(e, formData);
  }
  await writeAudit({ entity: "Order", entityId: orderId, action: "cancel", actorRole: "SHOP", shopId: ctx.shop.id, comment: reason });
  revalidatePath("/shop", "layout");
  return success("Заказ отменён, резерв освобождён");
}

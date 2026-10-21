"use server";

import { revalidatePath } from "next/cache";
import { requireActiveSupplier } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { parseAmount } from "@/lib/catalog";
import { registerDebtPayment, setCredit, supplierServesShop } from "@/lib/delivery";
import { OrderError } from "@/lib/orders";
import { formatMoney } from "@/lib/format";
import { formValues, success, type FormState } from "@/lib/forms";
import { db } from "@/lib/db";

function roleTag(role: string) {
  return role === "OWNER" ? "SUPPLIER_OWNER" : "SUPPLIER_ADMIN";
}

export async function setCreditAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const shopId = String(formData.get("shopId") ?? "");
  if (!(await supplierServesShop(db, ctx.supplier.id, shopId))) return { error: "Магазин не найден" };
  const creditAllowed = formData.get("creditAllowed") === "on";
  const limitRaw = String(formData.get("creditLimit") ?? "").trim();
  const creditLimit = limitRaw ? parseAmount(limitRaw) : null;
  if (limitRaw && (creditLimit === null || creditLimit < 0)) return { fieldErrors: { creditLimit: ["Неверная сумма"] }, values: formValues(formData) };
  const termRaw = String(formData.get("paymentTermDays") ?? "").trim();
  const paymentTermDays = termRaw ? Number(termRaw) : null;
  if (paymentTermDays !== null && (!Number.isInteger(paymentTermDays) || paymentTermDays < 1 || paymentTermDays > 365)) {
    return { fieldErrors: { paymentTermDays: ["Число дней от 1 до 365"] }, values: formValues(formData) };
  }
  const r = await setCredit(ctx.supplier.id, shopId, creditAllowed, creditLimit, paymentTermDays);
  await writeAudit({
    entity: "ShopAccount", entityId: shopId, action: "credit.update", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, shopId,
    changes: [{ field: "creditAllowed", old: r.before.creditAllowed, new: creditAllowed }, { field: "creditLimit", old: r.before.creditLimit, new: creditLimit }, { field: "paymentTermDays", old: r.before.paymentTermDays, new: paymentTermDays }],
  });
  revalidatePath("/supplier/shops", "layout");
  return success(creditAllowed ? `Работа в долг разрешена${creditLimit !== null ? `, лимит ${formatMoney(creditLimit)}` : ""}` : "Работа в долг запрещена");
}

export async function debtPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const shopId = String(formData.get("shopId") ?? "");
  if (!(await supplierServesShop(db, ctx.supplier.id, shopId))) return { error: "Магазин не найден" };
  const amount = parseAmount(String(formData.get("amount") ?? ""));
  const method = String(formData.get("method") ?? "CASH") as "CASH" | "CARD" | "TRANSFER";
  const date = String(formData.get("date") ?? "");
  const comment = String(formData.get("comment") ?? "").trim() || null;
  if (amount === null || amount <= 0) return { fieldErrors: { amount: ["Укажите сумму"] }, values: formValues(formData) };
  const occurredAt = date ? new Date(`${date}T12:00:00+05:00`) : new Date();
  if (Number.isNaN(occurredAt.getTime()) || occurredAt > new Date(Date.now() + 86400000)) return { fieldErrors: { date: ["Неверная дата"] }, values: formValues(formData) };
  let entry;
  try {
    entry = await registerDebtPayment(ctx.supplier.id, shopId, amount, method, occurredAt, comment);
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message, values: formValues(formData) };
    throw e;
  }
  await writeAudit({ entity: "DebtEntry", entityId: entry.id, action: "debt.payment", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, shopId, comment, changes: [{ field: "amount", old: null, new: amount }] });
  revalidatePath("/supplier/shops", "layout");
  return success(`Погашение ${formatMoney(amount)} записано`);
}

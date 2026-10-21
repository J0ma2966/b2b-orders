"use server";

import { revalidatePath } from "next/cache";
import { requireActiveSupplier } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { parseAmount } from "@/lib/catalog";
import { acceptHandover, CashError } from "@/lib/cash";
import { formatMoney } from "@/lib/format";
import { formValues, success, type FormState } from "@/lib/forms";

export async function acceptHandoverAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveSupplier();
  const courierId = String(formData.get("courierId") ?? "");
  const amount = parseAmount(String(formData.get("amount") ?? ""));
  const comment = String(formData.get("comment") ?? "").trim() || null;
  if (amount === null || amount <= 0) return { fieldErrors: { amount: ["Укажите принятую сумму"] }, values: formValues(formData) };
  let r;
  try {
    r = await acceptHandover(ctx.supplier.id, courierId, amount, comment);
  } catch (e) {
    if (e instanceof CashError) return { error: e.message, values: formValues(formData) };
    throw e;
  }
  await writeAudit({
    entity: "CashHandover",
    entityId: r.handover.id,
    action: "cash.accept",
    actorRole: ctx.membership.role === "OWNER" ? "SUPPLIER_OWNER" : "SUPPLIER_ADMIN",
    supplierId: ctx.supplier.id,
    comment,
    changes: [{ field: "amount", old: r.onHand, new: amount }],
  });
  revalidatePath("/supplier/cash");
  return success(r.diff === 0 ? `Принято ${formatMoney(amount)}, без расхождений` : `Принято ${formatMoney(amount)}, расхождение ${formatMoney(r.diff)}`);
}

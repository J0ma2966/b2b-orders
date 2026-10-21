"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireShopOwner } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { OrderError } from "@/lib/orders";
import { addShopStaff, resetShopStaffPassword, toggleShopStaff } from "@/lib/shop-team";
import { formValues, invalid, parseForm, req, success, type FormState } from "@/lib/forms";

const staffSchema = z.object({
  fullName: req(),
  phone: req().transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "Телефон в формате +998 90 123-45-67" });
    return p ?? "";
  }),
});

export async function addShopStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireShopOwner();
  const parsed = parseForm(staffSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const { fullName, phone } = parsed.data;
  let r;
  try {
    r = await addShopStaff(ctx.shop, fullName, phone);
  } catch (e) {
    if (e instanceof OrderError) return { fieldErrors: { phone: [e.message] }, values: formValues(formData) };
    throw e;
  }
  await writeAudit({ entity: "ShopMember", entityId: r.member.id, action: "create", actorRole: "SHOP", shopId: ctx.shop.id, changes: [{ field: "role", old: null, new: "STAFF" }, { field: "user", old: null, new: phone }] });
  revalidatePath("/shop/team");
  return {
    ...success(""),
    message: r.tempPassword
      ? `Добавлен ${fullName}. Временный пароль: ${r.tempPassword} — передайте его сотруднику, при первом входе он задаст свой.`
      : `Добавлен ${fullName}. Этот телефон уже зарегистрирован, сотрудник входит со своим паролем.`,
  };
}

export async function toggleShopStaffAction(formData: FormData) {
  const ctx = await requireShopOwner();
  try {
    const m = await toggleShopStaff(ctx.shop.id, String(formData.get("memberId") ?? ""));
    await writeAudit({ entity: "ShopMember", entityId: m.id, action: m.isActive ? "activate" : "deactivate", actorRole: "SHOP", shopId: ctx.shop.id, changes: [{ field: "isActive", old: !m.isActive, new: m.isActive }] });
  } catch (e) {
    if (!(e instanceof OrderError)) throw e;
  }
  revalidatePath("/shop/team");
}

export async function resetShopStaffPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireShopOwner();
  try {
    const r = await resetShopStaffPassword(ctx.shop.id, String(formData.get("memberId") ?? ""));
    await writeAudit({ entity: "User", entityId: r.member.userId, action: "password.reset", actorRole: "SHOP", shopId: ctx.shop.id });
    return { ok: true, message: `Новый временный пароль для ${r.member.user.fullName}: ${r.tempPassword}` };
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message };
    throw e;
  }
}

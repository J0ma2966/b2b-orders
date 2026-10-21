"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuth, requireSupplier } from "@/lib/auth/current";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { diffFields, writeAudit } from "@/lib/audit";
import { notifySuperAdmins, notifyUsers } from "@/lib/notify";
import { normalizePhone } from "@/lib/phone";
import { isRealFile, saveImage, UploadError } from "@/lib/storage";
import { supplierTransition } from "@/lib/statuses";
import { canManageMember } from "@/lib/supplier-roles";
import { coord, formValues, invalid, opt, parseForm, req, success, type FormState } from "@/lib/forms";

function roleTag(role: string) {
  return role === "OWNER" ? "SUPPLIER_OWNER" : role === "ADMIN" ? "SUPPLIER_ADMIN" : "COURIER";
}

// ───────────── Условия заказа (П5, Л1, П2) ─────────────

const toNum = (v: string) => Number(v.replace(/\s/g, "").replace(",", "."));
const optNum = (msg: string, min: number, max: number, int = false) =>
  opt()
    .refine((v) => {
      if (v === undefined) return true;
      const n = toNum(v);
      return Number.isFinite(n) && n >= min && n <= max && (!int || Number.isInteger(n));
    }, msg)
    .transform((v) => (v === undefined ? null : toNum(v)));

const termsSchema = z.object({
  minOrderTotal: optNum("Укажите сумму числом", 0, 1e12),
  orderCutoffHour: optNum("Час от 1 до 23", 1, 23, true),
});

export async function updateOrderTermsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const parsed = parseForm(termsSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const s = ctx.supplier;
  const data = {
    minOrderTotal: parsed.data.minOrderTotal,
    orderCutoffHour: parsed.data.orderCutoffHour,
    creditOverLimitBlock: formData.get("creditOverLimitBlock") === "on",
    skipAssembly: formData.get("skipAssembly") === "on",
  };
  const before = { ...s, minOrderTotal: s.minOrderTotal === null ? null : Number(s.minOrderTotal) };
  const changes = diffFields(before, data, ["minOrderTotal", "orderCutoffHour", "creditOverLimitBlock", "skipAssembly"]);
  if (changes.length === 0) return { ok: true, message: "Изменений нет" };
  await db.supplier.update({ where: { id: s.id }, data });
  await writeAudit({ entity: "Supplier", entityId: s.id, action: "terms.update", actorRole: roleTag(ctx.membership.role), supplierId: s.id, changes });
  revalidatePath("/supplier", "layout");
  return success("Условия заказа сохранены");
}

// ───────────── Профиль (ТЗ п. 9) ─────────────

const profileSchema = z.object({
  displayName: opt(),
  legalName: req(),
  legalAddress: req(),
  companyPhone: req().transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "Телефон в формате +998 90 123-45-67" });
    return p ?? "";
  }),
  email: z.email("Неверный email").trim(),
  website: opt(),
  contactPerson: req(),
  description: opt(),
  officeTerritoryId: req("Выберите регион и город офиса"),
  officeAddress: req(),
  officeLat: coord("Отметьте офис на карте"),
  officeLng: coord("Отметьте офис на карте"),
});

const PROFILE_FIELDS = [
  "displayName", "legalName", "legalAddress", "phone", "email", "website", "contactPerson",
  "description", "officeTerritoryId", "officeAddress", "officeLat", "officeLng", "logoPath",
] as const;

export async function updateSupplierProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const parsed = parseForm(profileSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const s = ctx.supplier;
  let logoPath = s.logoPath;
  const logo = formData.get("logo");
  try {
    if (isRealFile(logo)) logoPath = await saveImage(logo, "logos");
  } catch (e) {
    if (e instanceof UploadError) return { fieldErrors: { logo: [e.message] }, values: formValues(formData) };
    throw e;
  }
  const data = {
    displayName: d.displayName ?? d.legalName,
    legalName: d.legalName,
    legalAddress: d.legalAddress,
    phone: d.companyPhone,
    email: d.email,
    website: d.website ?? null,
    contactPerson: d.contactPerson,
    description: d.description ?? null,
    officeTerritoryId: d.officeTerritoryId,
    officeAddress: d.officeAddress,
    officeLat: d.officeLat,
    officeLng: d.officeLng,
    logoPath,
  };
  const changes = diffFields(s, data, [...PROFILE_FIELDS]);
  if (changes.length === 0) return { ok: true, message: "Изменений нет" };
  await db.supplier.update({ where: { id: s.id }, data });
  await writeAudit({ entity: "Supplier", entityId: s.id, action: "profile.update", actorRole: roleTag(ctx.membership.role), supplierId: s.id, changes });
  revalidatePath("/supplier", "layout");
  return { ok: true, message: "Профиль сохранён" };
}

// Повторная отправка заявки после запроса сведений или отказа
export async function resubmitSupplierAction() {
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const to = supplierTransition("resubmit", ctx.supplier.status);
  if (!to) redirect("/supplier");
  const auth = await getAuth();
  await db.$transaction(async (tx) => {
    await tx.supplier.update({ where: { id: ctx.supplier.id }, data: { status: to } });
    await tx.supplierStatusHistory.create({
      data: { supplierId: ctx.supplier.id, fromStatus: ctx.supplier.status, toStatus: to, comment: "Заявка отправлена повторно", userId: auth?.realUser.id },
    });
    await writeAudit(
      { entity: "Supplier", entityId: ctx.supplier.id, action: "moderation.resubmit", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, changes: [{ field: "status", old: ctx.supplier.status, new: to }] },
      tx,
    );
    await notifySuperAdmins(
      { type: "supplier.application", title: "Поставщик повторно отправил заявку", body: ctx.supplier.legalName, link: `/admin/suppliers/${ctx.supplier.id}`, entity: "Supplier", entityId: ctx.supplier.id },
      tx,
    );
  });
  revalidatePath("/supplier", "layout");
  redirect("/supplier");
}

// ───────────── Территория доставки (ТЗ п. 10) ─────────────

export async function updateTerritoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const ids = [...new Set(formData.getAll("territoryIds[]").map(String).filter(Boolean))];
  if (ids.length === 0) return { error: "Выберите хотя бы одну территорию доставки" };
  if ((await db.territory.count({ where: { id: { in: ids } } })) !== ids.length) return { error: "Неверная территория" };
  const before = (await db.supplierTerritory.findMany({ where: { supplierId: ctx.supplier.id } })).map((t) => t.territoryId).sort();
  const after = [...ids].sort();
  if (JSON.stringify(before) === JSON.stringify(after)) return { ok: true, message: "Изменений нет" };
  // Оставшиеся территории сохраняют дни доставки и закреплённого доставщика
  const removed = before.filter((id) => !ids.includes(id));
  const added = ids.filter((id) => !before.includes(id));
  await db.$transaction([
    db.supplierTerritory.deleteMany({ where: { supplierId: ctx.supplier.id, territoryId: { in: removed } } }),
    db.supplierTerritory.createMany({ data: added.map((territoryId) => ({ supplierId: ctx.supplier.id, territoryId })) }),
  ]);
  await writeAudit({
    entity: "Supplier",
    entityId: ctx.supplier.id,
    action: "territory.update",
    actorRole: roleTag(ctx.membership.role),
    supplierId: ctx.supplier.id,
    changes: [{ field: "territories", old: before, new: after }],
  });
  revalidatePath("/supplier/territory");
  return { ok: true, message: "Территория доставки сохранена" };
}

// П5, П8: дни доставки и закреплённый доставщик по каждой территории
export async function updateTerritoryTermsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const [rows, couriers] = await Promise.all([
    db.supplierTerritory.findMany({ where: { supplierId: ctx.supplier.id } }),
    db.supplierMember.findMany({ where: { supplierId: ctx.supplier.id, role: "COURIER", isActive: true }, select: { userId: true } }),
  ]);
  const courierIds = new Set(couriers.map((c) => c.userId));
  const changes = [];
  const updates = [];
  for (const r of rows) {
    const weekdays = [...new Set(formData.getAll(`wd_${r.territoryId}`).map(Number))].filter((d) => d >= 1 && d <= 7).sort();
    const c = String(formData.get(`courier_${r.territoryId}`) ?? "");
    const courierId = c && courierIds.has(c) ? c : null;
    // Все семь дней — то же, что «каждый день»
    const days = weekdays.length === 7 ? [] : weekdays;
    if (JSON.stringify(days) === JSON.stringify(r.deliveryWeekdays) && courierId === r.courierId) continue;
    changes.push({ field: `territory.${r.territoryId}`, old: { weekdays: r.deliveryWeekdays, courierId: r.courierId }, new: { weekdays: days, courierId } });
    updates.push(db.supplierTerritory.update({ where: { supplierId_territoryId: { supplierId: ctx.supplier.id, territoryId: r.territoryId } }, data: { deliveryWeekdays: days, courierId } }));
  }
  if (updates.length === 0) return { ok: true, message: "Изменений нет" };
  await db.$transaction(updates);
  await writeAudit({ entity: "Supplier", entityId: ctx.supplier.id, action: "territory.terms", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id, changes });
  revalidatePath("/supplier/territory");
  return success("Дни доставки сохранены");
}

// ───────────── Команда: администраторы и доставщики (ТЗ п. 4–6) ─────────────

const memberSchema = z.object({
  fullName: req(),
  phone: req().transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "Телефон в формате +998 90 123-45-67" });
    return p ?? "";
  }),
  role: z.enum(["ADMIN", "COURIER"]),
});

export async function addMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const parsed = parseForm(memberSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const { fullName, phone, role } = parsed.data;
  if (!canManageMember(ctx.membership.role, role)) return { error: "Недостаточно прав для добавления этой роли" };

  let user = await db.user.findUnique({ where: { phone } });
  let tempPassword: string | undefined;
  if (user?.isSuperAdmin) return { fieldErrors: { phone: ["Этот телефон нельзя добавить"] } };
  if (user) {
    const existing = await db.supplierMember.findUnique({ where: { supplierId_userId: { supplierId: ctx.supplier.id, userId: user.id } } });
    if (existing) return { fieldErrors: { phone: ["Этот пользователь уже в команде"] }, values: formValues(formData) };
  } else {
    tempPassword = generateTempPassword();
    user = await db.user.create({ data: { phone, fullName, passwordHash: await hashPassword(tempPassword), mustChangePassword: true } });
  }
  const member = await db.supplierMember.create({ data: { supplierId: ctx.supplier.id, userId: user.id, role } });
  await writeAudit({
    entity: "SupplierMember",
    entityId: member.id,
    action: "create",
    actorRole: roleTag(ctx.membership.role),
    supplierId: ctx.supplier.id,
    changes: [{ field: "role", old: null, new: role }, { field: "user", old: null, new: phone }],
  });
  await notifyUsers([user.id], {
    type: "supplier.member",
    title: `Вас добавили в команду «${ctx.supplier.displayName}»`,
    link: role === "COURIER" ? "/courier" : "/supplier",
  });
  revalidatePath("/supplier/team");
  return {
    ...success(""),
    message: tempPassword
      ? `Добавлен ${fullName}. Временный пароль: ${tempPassword} — передайте его сотруднику, при первом входе он задаст свой.`
      : `Добавлен ${fullName}. Этот телефон уже зарегистрирован, сотрудник входит со своим паролем.`,
  };
}

export async function toggleMemberAction(formData: FormData) {
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const member = await db.supplierMember.findUnique({ where: { id: String(formData.get("memberId") ?? "") } });
  if (!member || member.supplierId !== ctx.supplier.id || !canManageMember(ctx.membership.role, member.role)) return;
  await db.supplierMember.update({ where: { id: member.id }, data: { isActive: !member.isActive } });
  // Отключённый сотрудник сразу теряет доступ к организации
  if (member.isActive) {
    await db.session.updateMany({ where: { userId: member.userId, activeSupplierId: ctx.supplier.id }, data: { activeSupplierId: null } });
  }
  await writeAudit({
    entity: "SupplierMember",
    entityId: member.id,
    action: member.isActive ? "deactivate" : "activate",
    actorRole: roleTag(ctx.membership.role),
    supplierId: ctx.supplier.id,
    changes: [{ field: "isActive", old: member.isActive, new: !member.isActive }],
  });
  revalidatePath("/supplier/team");
}

export async function resetMemberPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const member = await db.supplierMember.findUnique({ where: { id: String(formData.get("memberId") ?? "") }, include: { user: true } });
  if (!member || member.supplierId !== ctx.supplier.id || !canManageMember(ctx.membership.role, member.role)) return { error: "Недостаточно прав" };
  // Сбрасывать пароль можно только тем, кто работает только у этого поставщика
  const elsewhere = await db.supplierMember.count({ where: { userId: member.userId, NOT: { supplierId: ctx.supplier.id } } });
  const shops = await db.shopMember.count({ where: { userId: member.userId } });
  if (elsewhere > 0 || shops > 0 || member.user.isSuperAdmin) return { error: "Пользователь работает и в других организациях, пароль он меняет сам" };
  const tempPassword = generateTempPassword();
  await db.user.update({ where: { id: member.userId }, data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true } });
  await db.session.deleteMany({ where: { userId: member.userId } });
  await writeAudit({ entity: "User", entityId: member.userId, action: "password.reset", actorRole: roleTag(ctx.membership.role), supplierId: ctx.supplier.id });
  return { ok: true, message: `Новый временный пароль для ${member.user.fullName}: ${tempPassword}` };
}

// Переключение организации, если пользователь работает у нескольких поставщиков
export async function switchSupplierAction(formData: FormData) {
  const ctx = await requireSupplier(["OWNER", "ADMIN", "COURIER"]);
  const supplierId = String(formData.get("supplierId") ?? "");
  const m = ctx.memberships.find((x) => x.supplierId === supplierId);
  if (!m) return;
  await db.session.update({ where: { id: ctx.auth.session.id }, data: { activeSupplierId: supplierId } });
  redirect(m.role === "COURIER" ? "/courier" : "/supplier");
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { diffFields, writeAudit } from "@/lib/audit";
import { normalizeInn } from "@/lib/inn";
import { normalizePhone } from "@/lib/phone";
import { isRealFile, saveImage, UploadError } from "@/lib/storage";
import { coord, formValues, invalid, opt, parseForm, req, type FormState } from "@/lib/forms";

const phone = (required: boolean) =>
  (required ? req() : opt()).transform((v, ctx) => {
    if (!v) return undefined;
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "Телефон в формате +998 90 123-45-67" });
    return p ?? undefined;
  });

const profileSchema = z.object({
  name: req(),
  inn: opt().transform((v, ctx) => {
    if (!v) return undefined;
    const inn = normalizeInn(v);
    if (!inn) ctx.addIssue({ code: "custom", message: "ИНН: 9 цифр (или ПИНФЛ 14 цифр)" });
    return inn ?? undefined;
  }),
  shopPhone: phone(true),
  phone2: phone(false),
  contactName: req(),
  address: req(),
  territoryId: req("Выберите регион и город"),
  lat: coord("Отметьте магазин на карте"),
  lng: coord("Отметьте магазин на карте"),
});

export async function updateShopProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireShop();
  if (ctx.membership.role !== "OWNER") return { error: "Изменить профиль может только владелец магазина" };
  const parsed = parseForm(profileSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const shop = ctx.shop;
  let photoPaths = shop.photoPaths;
  const photo = formData.get("photo");
  try {
    if (isRealFile(photo)) photoPaths = [...photoPaths, await saveImage(photo, "shops")].slice(-5);
  } catch (e) {
    if (e instanceof UploadError) return { fieldErrors: { photo: [e.message] }, values: formValues(formData) };
    throw e;
  }
  const data = {
    name: d.name,
    inn: d.inn ?? null,
    phone: d.shopPhone!,
    phone2: d.phone2 ?? null,
    contactName: d.contactName,
    address: d.address,
    territoryId: d.territoryId,
    lat: d.lat,
    lng: d.lng,
    photoPaths,
  };
  const changes = diffFields(shop, data, ["name", "inn", "phone", "phone2", "contactName", "address", "territoryId", "lat", "lng", "photoPaths"]);
  if (changes.length === 0) return { ok: true, message: "Изменений нет" };
  await db.shop.update({ where: { id: shop.id }, data });
  await writeAudit({ entity: "Shop", entityId: shop.id, action: "profile.update", actorRole: "SHOP", shopId: shop.id, changes });
  revalidatePath("/shop", "layout");
  return { ok: true, message: "Профиль сохранён" };
}

export async function switchShopAction(formData: FormData) {
  const ctx = await requireShop();
  const shopId = String(formData.get("shopId") ?? "");
  if (!ctx.memberships.some((m) => m.shopId === shopId)) return;
  await db.session.update({ where: { id: ctx.auth.session.id }, data: { activeShopId: shopId } });
  revalidatePath("/shop", "layout");
  redirect("/shop");
}

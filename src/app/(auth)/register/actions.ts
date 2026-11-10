"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { normalizeInn } from "@/lib/inn";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { createSession, requestMeta } from "@/lib/auth/session";
import { isLocalNetworkHost } from "@/lib/auth/cookie-secure";
import { getAuth } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { notifySuperAdmins } from "@/lib/notify";
import { isRealFile, saveImage, UploadError } from "@/lib/storage";
import { getLocale } from "@/lib/i18n/server";
import { coord, formValues, invalid, opt, parseForm, req, type FormState } from "@/lib/forms";
import { finishLoginAttempt, reserveLoginAttempt } from "@/lib/auth/login-attempts";
import { codeChannels, phoneConfirmChannels, requestLoginCode, verifyRegisterCode } from "@/lib/login-code";
import { cleanCode } from "@/lib/login-code-core";

const phoneField = (msg = "Телефон в формате +998 90 123-45-67") =>
  req().transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: msg });
    return p ?? "";
  });

const optPhone = () =>
  opt().transform((v, ctx) => {
    if (!v) return undefined;
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "Телефон в формате +998 90 123-45-67" });
    return p ?? undefined;
  });

const accountSchema = z
  .object({
    fullName: req(),
    loginPhone: phoneField(),
    password: z.string().min(MIN_PASSWORD_LENGTH, `Минимум ${MIN_PASSWORD_LENGTH} символов`),
    password2: z.string(),
  })
  .refine((d) => d.password === d.password2, { path: ["password2"], message: "Пароли не совпадают" });

// Создаёт учётную запись или берёт текущую, если пользователь уже вошёл.
const REGISTRATIONS_PER_HOUR = 10;

async function resolveAccount(formData: FormData) {
  const auth = await getAuth();
  if (auth) {
    if (auth.isImpersonating) return { error: { error: "Недоступно в режиме «от имени»" } as FormState };
    return { userId: auth.user.id, existing: true as const };
  }
  const parsed = parseForm(accountSchema, formData);
  if (!parsed.success) return { error: invalid(parsed.error, formData) };
  // Защита от массовой регистрации ботами: не больше 10 новых учётных записей в час с одного адреса.
  // Локальные адреса не ограничиваем: это проверка в своей сети или прокси без X-Forwarded-For —
  // тогда у всех один адрес, и лимит закрыл бы регистрацию для всех.
  const { ip } = await requestMeta();
  if (ip && !isLocalNetworkHost(ip.replace(/^::ffff:/, ""))) {
    const recent = await db.auditLog.count({ where: { action: "register", ip, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
    if (recent >= REGISTRATIONS_PER_HOUR) return { error: { error: "Слишком много регистраций с этого адреса. Попробуйте через час.", values: formValues(formData) } as FormState };
  }
  const exists = await db.user.findUnique({ where: { phone: parsed.data.loginPhone } });
  if (exists) {
    return {
      error: {
        fieldErrors: { loginPhone: ["Этот телефон уже зарегистрирован. Войдите, чтобы продолжить."] },
        values: formValues(formData),
      } as FormState,
    };
  }
  // Номер подтверждается кодом, когда на сервере настроен бот Telegram или SMS. Сам код проверяется
  // последним шагом (confirmPhone), после всех остальных полей: иначе ошибка в адресе или на карте
  // сжигала бы код, и его пришлось бы получать заново.
  const phoneCode = phoneConfirmationRequired() ? cleanCode(String(formData.get("phoneCode") ?? "")) : undefined;
  if (phoneCode === null) {
    return { error: { fieldErrors: { phoneCode: ["Подтвердите номер: получите код и введите 6 цифр"] }, values: formValues(formData) } as FormState };
  }
  return {
    phoneCode,
    ip,
    account: {
      fullName: parsed.data.fullName,
      phone: parsed.data.loginPhone,
      passwordHash: await hashPassword(parsed.data.password),
      locale: await getLocale(),
    },
  };
}

function phoneConfirmationRequired() {
  return phoneConfirmChannels() !== null;
}

type NewAccount = { phone: string; fullName: string; passwordHash: string; locale: string; telegramChatId?: string };

// Проверка кода подтверждения номера. Вызывается перед самым созданием учётной записи.
// Возвращает ошибку формы или ничего; чат Telegram, из которого поделились номером, привязывается к аккаунту.
async function confirmPhone(acc: { phoneCode?: string; ip?: string | null; account?: NewAccount }, formData: FormData): Promise<FormState | null> {
  if (!acc.account || acc.phoneCode === undefined) return null;
  const values = formValues(formData);
  // Общий с входом лимит неудач: код нельзя перебирать
  const attemptId = await reserveLoginAttempt(acc.account.phone, acc.ip ?? null);
  if (!attemptId) return { fieldErrors: { phoneCode: ["Слишком много неудачных попыток. Попробуйте через 15 минут."] }, values };
  const ok = await verifyRegisterCode(acc.account.phone, acc.phoneCode);
  await finishLoginAttempt(attemptId, !!ok);
  if (!ok) return { fieldErrors: { phoneCode: ["Неверный или устаревший код"] }, values };
  if (ok.chatId) {
    // Один чат — один пользователь (как при подключении бота из профиля)
    await db.user.updateMany({ where: { telegramChatId: ok.chatId }, data: { telegramChatId: null } });
    acc.account.telegramChatId = ok.chatId;
  }
  return null;
}

export type RegisterCodeState = { ok?: boolean; botUrl?: string | null; channel?: "TELEGRAM" | "SMS"; error?: string; errorParams?: Record<string, string | number>; sentAt?: number };

// Кнопка «Получить код» в форме регистрации
export async function requestRegisterCodeAction(rawPhone: string, wanted?: "TELEGRAM" | "SMS"): Promise<RegisterCodeState> {
  if (await getAuth()) return { error: "Вы уже вошли" };
  const phone = normalizePhone(String(rawPhone ?? ""));
  if (!phone) return { error: "Телефон в формате +998 90 123-45-67" };
  const channels = codeChannels();
  const channel = wanted === "SMS" && channels.sms ? "SMS" : channels.telegram ? "TELEGRAM" : "SMS";
  const { ip } = await requestMeta();
  const r = await requestLoginCode(phone, channel, ip, "REGISTER");
  if (!r.ok) return { error: r.error, errorParams: r.retryInSec ? { n: r.retryInSec } : undefined };
  return { ok: true, botUrl: r.botUrl, channel, sentAt: Date.now() };
}

// ───────────── Магазин (ТЗ п. 11–13) ─────────────

const shopSchema = z.object({
  name: req(),
  inn: opt().transform((v, ctx) => {
    if (!v) return undefined;
    const inn = normalizeInn(v);
    if (!inn) ctx.addIssue({ code: "custom", message: "ИНН: 9 цифр (или ПИНФЛ 14 цифр)" });
    return inn ?? undefined;
  }),
  shopPhone: optPhone(),
  phone2: optPhone(),
  contactName: opt(),
  address: req(),
  territoryId: req("Выберите регион и город"),
  lat: coord("Отметьте магазин на карте"),
  lng: coord("Отметьте магазин на карте"),
});

export async function registerShopAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const acc = await resolveAccount(formData);
  if (acc.error) return acc.error;
  const parsed = parseForm(shopSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const values = formValues(formData);

  const territory = await db.territory.findUnique({ where: { id: d.territoryId } });
  if (!territory || territory.type === "COUNTRY") return { fieldErrors: { territoryId: ["Выберите регион и город"] }, values };

  let photoPath: string | undefined;
  const photo = formData.get("photo");
  try {
    if (isRealFile(photo)) photoPath = await saveImage(photo, "shops");
  } catch (e) {
    if (e instanceof UploadError) return { fieldErrors: { photo: [e.message] }, values };
    throw e;
  }

  const phoneError = await confirmPhone(acc, formData);
  if (phoneError) return phoneError;

  const shop = await db.$transaction(async (tx) => {
    const userId = acc.userId ?? (await tx.user.create({ data: acc.account! })).id;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const created = await tx.shop.create({
      data: {
        name: d.name,
        inn: d.inn,
        phone: d.shopPhone ?? user.phone,
        phone2: d.phone2,
        contactName: d.contactName ?? user.fullName,
        address: d.address,
        lat: d.lat,
        lng: d.lng,
        territoryId: d.territoryId,
        photoPaths: photoPath ? [photoPath] : [],
        members: { create: { userId, role: "OWNER" } },
        statusHistory: { create: { toStatus: "NEW", userId, reason: "Регистрация" } },
      },
    });
    return created;
  });

  const userId = acc.userId ?? (await db.user.findUniqueOrThrow({ where: { phone: acc.account!.phone } })).id;
  if (acc.userId) {
    const auth = await getAuth();
    if (auth) await db.session.update({ where: { id: auth.session.id }, data: { activeShopId: shop.id } });
  } else {
    await createSession(userId, { activeShopId: shop.id });
  }
  await writeAudit({ entity: "Shop", entityId: shop.id, action: "register", actorUserId: userId, actorRole: "SHOP", shopId: shop.id });
  redirect("/shop");
}

// ───────────── Поставщик (ТЗ п. 8–10) ─────────────

const supplierSchema = z.object({
  legalName: req(),
  displayName: opt(),
  inn: req().transform((v, ctx) => {
    const inn = normalizeInn(v);
    if (!inn) ctx.addIssue({ code: "custom", message: "ИНН: 9 цифр" });
    return inn ?? "";
  }),
  legalAddress: req(),
  companyPhone: phoneField(),
  email: z.email("Неверный email").trim(),
  website: opt(),
  contactPerson: opt(),
  description: opt(),
  officeTerritoryId: req("Выберите регион и город офиса"),
  officeAddress: req(),
  officeLat: coord("Отметьте офис на карте"),
  officeLng: coord("Отметьте офис на карте"),
  "territoryIds[]": z.array(z.string()).min(1, "Выберите хотя бы одну территорию доставки"),
});

export async function registerSupplierAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const acc = await resolveAccount(formData);
  if (acc.error) return acc.error;
  if (!formData.has("territoryIds[]")) formData.set("territoryIds[]", "");
  const parsed = parseForm(supplierSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const values = formValues(formData);
  const territoryIds = d["territoryIds[]"].filter(Boolean);
  if (territoryIds.length === 0) return { fieldErrors: { territoryIds: ["Выберите хотя бы одну территорию доставки"] }, values };

  if (await db.supplier.findUnique({ where: { inn: d.inn } })) {
    return { fieldErrors: { inn: ["Поставщик с таким ИНН уже зарегистрирован"] }, values };
  }
  const validTerritories = await db.territory.count({ where: { id: { in: territoryIds } } });
  if (validTerritories !== territoryIds.length) return { error: "Неверная территория доставки", values };

  let logoPath: string | undefined;
  const logo = formData.get("logo");
  try {
    if (isRealFile(logo)) logoPath = await saveImage(logo, "logos");
  } catch (e) {
    if (e instanceof UploadError) return { fieldErrors: { logo: [e.message] }, values };
    throw e;
  }

  const phoneError = await confirmPhone(acc, formData);
  if (phoneError) return phoneError;

  const supplier = await db.$transaction(async (tx) => {
    const userId = acc.userId ?? (await tx.user.create({ data: acc.account! })).id;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    return tx.supplier.create({
      data: {
        legalName: d.legalName,
        displayName: d.displayName ?? d.legalName,
        inn: d.inn,
        legalAddress: d.legalAddress,
        phone: d.companyPhone,
        email: d.email,
        website: d.website,
        contactPerson: d.contactPerson ?? user.fullName,
        description: d.description,
        logoPath,
        officeTerritoryId: d.officeTerritoryId,
        officeAddress: d.officeAddress,
        officeLat: d.officeLat,
        officeLng: d.officeLng,
        // Поставщик-ИП развозит сам с первого дня; с доставщиками выключается в «Доставке»
        members: { create: { userId, role: "OWNER", delivers: true } },
        territories: { create: territoryIds.map((territoryId) => ({ territoryId })) },
        statusHistory: { create: { toStatus: "PENDING", userId, comment: "Заявка подана" } },
      },
    });
  });

  const userId = acc.userId ?? (await db.user.findUniqueOrThrow({ where: { phone: acc.account!.phone } })).id;
  if (acc.userId) {
    const auth = await getAuth();
    if (auth) await db.session.update({ where: { id: auth.session.id }, data: { activeSupplierId: supplier.id } });
  } else {
    await createSession(userId, { activeSupplierId: supplier.id });
  }
  await writeAudit({ entity: "Supplier", entityId: supplier.id, action: "register", actorUserId: userId, actorRole: "SUPPLIER_OWNER", supplierId: supplier.id });
  await notifySuperAdmins({
    type: "supplier.application",
    title: "Новая заявка поставщика",
    body: supplier.legalName,
    link: `/admin/suppliers/${supplier.id}`,
    entity: "Supplier",
    entityId: supplier.id,
  });
  redirect("/supplier");
}

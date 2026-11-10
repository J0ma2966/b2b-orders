"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/auth/password";
import { canResetWithoutCurrent, createSession, destroySession, requestMeta } from "@/lib/auth/session";
import { homePathFor, requireAuth } from "@/lib/auth/current";
import { syncLocaleOnLogin } from "@/lib/i18n/server";
import { formValues, invalid, parseForm, type FormState } from "@/lib/forms";
import { finishLoginAttempt, reserveLoginAttempt } from "@/lib/auth/login-attempts";

const loginSchema = z.object({
  phone: z.string().trim().min(1, "Введите телефон"),
  password: z.string().min(1, "Введите пароль"),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const phone = normalizePhone(parsed.data.phone);
  const values = formValues(formData);
  if (!phone) return { fieldErrors: { phone: ["Телефон в формате +998 90 123-45-67"] }, values };

  const { ip } = await requestMeta();
  // Попытка записывается до проверки пароля: одновременные запросы лимит не обходят
  const attemptId = await reserveLoginAttempt(phone, ip);
  if (!attemptId) return { error: "Слишком много неудачных попыток. Попробуйте через 15 минут.", values };

  const user = await db.user.findUnique({ where: { phone } });
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  await finishLoginAttempt(attemptId, ok && user?.status === "ACTIVE");
  if (!user || !ok) return { error: "Неверный телефон или пароль", values };
  if (user.status !== "ACTIVE") return { error: "Учётная запись заблокирована. Обратитесь к администратору.", values };

  await createSession(user.id);
  await syncLocaleOnLogin(user);
  if (user.mustChangePassword) redirect("/account/password");
  redirect(await homePathFor({ isSuperAdmin: user.isSuperAdmin, user }));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

const passwordSchema = z
  .object({
    current: z.string().optional(),
    password: z.string().min(MIN_PASSWORD_LENGTH, `Минимум ${MIN_PASSWORD_LENGTH} символов`),
    password2: z.string(),
  })
  .refine((d) => d.password === d.password2, { path: ["password2"], message: "Пароли не совпадают" });

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const auth = await requireAuth({ allowTempPassword: true });
  if (auth.isImpersonating) return { error: "Нельзя менять пароль в режиме «от имени»" };
  const parsed = parseForm(passwordSchema, formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  // После входа по коду («Забыли пароль?») старый пароль не спрашиваем — 15 минут
  if (!canResetWithoutCurrent(auth.session)) {
    if (!parsed.data.current) return { fieldErrors: { current: ["Введите текущий пароль"] } };
    if (!(await verifyPassword(parsed.data.current, auth.realUser.passwordHash))) {
      return { fieldErrors: { current: ["Неверный текущий пароль"] } };
    }
  }
  await db.$transaction([
    db.user.update({
      where: { id: auth.realUser.id },
      data: { passwordHash: await hashPassword(parsed.data.password), mustChangePassword: false },
    }),
    db.session.update({ where: { id: auth.session.id }, data: { passwordResetUntil: null } }),
    // Выходим на остальных устройствах
    db.session.deleteMany({ where: { userId: auth.realUser.id, NOT: { id: auth.session.id } } }),
  ]);
  redirect(await homePathFor(auth));
}

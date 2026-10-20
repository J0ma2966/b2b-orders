"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getAuth } from "@/lib/auth/current";
import { LOCALE_COOKIE, parseLocale } from "@/lib/i18n/core";

// Выбор языка: cookie на устройстве и настройка пользователя (для push-уведомлений)
export async function setLocaleAction(formData: FormData) {
  const locale = parseLocale(String(formData.get("locale") ?? ""));
  if (!locale) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const auth = await getAuth();
  if (auth) await db.user.update({ where: { id: auth.realUser.id }, data: { locale } });
}

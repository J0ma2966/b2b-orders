import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, makeT, parseLocale, type Locale } from "./core";

// Язык из cookie (выбор на этом устройстве), иначе из настроек браузера, по умолчанию русский
export const getLocale = cache(async (): Promise<Locale> => {
  const fromCookie = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  const accept = (await headers()).get("accept-language") ?? "";
  return /^uz\b/i.test(accept.trim()) ? "uz" : "ru";
});

export async function getT() {
  return makeT(await getLocale());
}

// При входе: выбранный на устройстве язык сохраняется в профиле, а если не выбран — берётся из профиля
export async function syncLocaleOnLogin(user: { id: string; locale: string }) {
  const { db } = await import("@/lib/db");
  const jar = await cookies();
  const chosen = parseLocale(jar.get(LOCALE_COOKIE)?.value);
  if (chosen) {
    if (chosen !== user.locale) await db.user.update({ where: { id: user.id }, data: { locale: chosen } });
    return;
  }
  const saved = parseLocale(user.locale);
  if (saved) jar.set(LOCALE_COOKIE, saved, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

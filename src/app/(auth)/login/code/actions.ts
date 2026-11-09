"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { createSession, requestMeta } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/current";
import { syncLocaleOnLogin } from "@/lib/i18n/server";
import { requestLoginCode, verifyLoginCode } from "@/lib/login-code";
import { cleanCode, PASSWORD_RESET_WINDOW_MS } from "@/lib/login-code-core";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_PHONE = 5;
const MAX_FAILS_PER_IP = 30;

export type CodeFormState = {
  step: "phone" | "code";
  phone?: string;
  channel?: "TELEGRAM" | "SMS";
  botUrl?: string | null;
  error?: string;
  errorParams?: Record<string, string | number>;
  sentAt?: number;
};

export async function requestCodeAction(prev: CodeFormState, formData: FormData): Promise<CodeFormState> {
  const rawPhone = String(formData.get("phone") ?? "");
  const channel = formData.get("channel") === "SMS" ? "SMS" : "TELEGRAM";
  const phone = normalizePhone(rawPhone);
  if (!phone) return { step: "phone", phone: rawPhone, channel, error: "Телефон в формате +998 90 123-45-67" };
  const { ip } = await requestMeta();
  const r = await requestLoginCode(phone, channel, ip);
  if (!r.ok) {
    const back: CodeFormState = prev.step === "code" && prev.phone === phone ? prev : { step: "phone", phone: rawPhone, channel };
    return { ...back, error: r.error, errorParams: r.retryInSec ? { n: r.retryInSec } : undefined };
  }
  return { step: "code", phone, channel, botUrl: r.botUrl, sentAt: Date.now() };
}

export async function verifyCodeAction(prev: CodeFormState, formData: FormData): Promise<CodeFormState> {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { step: "phone", error: "Телефон в формате +998 90 123-45-67" };
  const code = cleanCode(String(formData.get("code") ?? ""));
  if (!code) return { ...prev, error: "Введите 6 цифр кода" };

  // Общий с входом по паролю счётчик неудач: код нельзя подбирать, чередуя с паролем
  const { ip } = await requestMeta();
  const since = new Date(Date.now() - WINDOW_MS);
  const [phoneFails, ipFails] = await Promise.all([
    db.loginAttempt.count({ where: { phone, success: false, createdAt: { gte: since } } }),
    ip ? db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }) : 0,
  ]);
  if (phoneFails >= MAX_FAILS_PER_PHONE || ipFails >= MAX_FAILS_PER_IP) {
    return { ...prev, error: "Слишком много неудачных попыток. Попробуйте через 15 минут." };
  }

  const user = await verifyLoginCode(phone, code);
  await db.loginAttempt.create({ data: { phone, ip, success: !!user } });
  if (!user) return { ...prev, error: "Неверный или устаревший код" };

  await createSession(user.id, { passwordResetUntil: new Date(Date.now() + PASSWORD_RESET_WINDOW_MS) });
  await syncLocaleOnLogin(user);
  if (formData.get("reset") === "1" || user.mustChangePassword) redirect("/account/password");
  redirect(await homePathFor({ isSuperAdmin: user.isSuperAdmin, user }));
}

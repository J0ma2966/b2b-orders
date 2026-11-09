"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/current";
import { createTelegramLink } from "@/lib/login-code";

// Ссылка на бота входа: человек открывает её и делится номером — чат привязывается к аккаунту
export async function telegramLinkAction(): Promise<{ url?: string; error?: string }> {
  const auth = await requireAuth();
  if (auth.isImpersonating) return { error: "Недоступно в режиме «от имени»" };
  try {
    const url = await createTelegramLink(auth.realUser.id, auth.realUser.phone);
    return url ? { url } : { error: "Бот для кодов входа не настроен" };
  } catch (e) {
    console.error("[telegram-login] link failed", e);
    return { error: "Не удалось связаться с Telegram. Попробуйте позже." };
  }
}

export async function telegramUnlinkAction() {
  const auth = await requireAuth();
  if (auth.isImpersonating) return;
  await db.user.update({ where: { id: auth.realUser.id }, data: { telegramChatId: null } });
  revalidatePath("/account");
}

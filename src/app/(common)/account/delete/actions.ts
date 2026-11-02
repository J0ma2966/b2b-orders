"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current";
import { verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { deleteUserAccount } from "@/lib/account-deletion";
import type { FormState } from "@/lib/forms";

export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const auth = await requireAuth({ allowTempPassword: true });
  if (auth.isImpersonating) return { error: "Нельзя удалить аккаунт в режиме «от имени»" };
  if (auth.realUser.isSuperAdmin) return { error: "Аккаунт супер-администратора удаляется только через сервер" };
  if (formData.get("confirm") !== "on") return { fieldErrors: { confirm: ["Подтвердите удаление"] } };
  const password = formData.get("password");
  if (typeof password !== "string" || !(await verifyPassword(password, auth.realUser.passwordHash))) {
    return { fieldErrors: { password: ["Неверный пароль"] } };
  }
  // Запись в журнал — до удаления, пока известна сессия; в ней нет телефона и имени
  await writeAudit({ entity: "User", entityId: auth.realUser.id, action: "account_deleted", actorRole: "USER" });
  await deleteUserAccount(auth.realUser.id);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/account-deletion?done=1");
}

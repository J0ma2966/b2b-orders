"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { pollSupportMail } from "@/lib/support-mail";
import { supportFilter, supportWhere } from "./filter";

// Отметить письмо обработанным или вернуть в новые
export async function setSupportEmailHandledAction(formData: FormData) {
  const auth = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const handled = formData.get("handled") === "1";
  await db.supportEmail.updateMany({
    where: { id },
    data: handled ? { handledAt: new Date(), handledById: auth.user.id } : { handledAt: null, handledById: null },
  });
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${id}`);
}

// «Проверить почту сейчас», не дожидаясь очередной минуты
export async function checkSupportMailAction() {
  await requireSuperAdmin();
  await pollSupportMail();
  revalidatePath("/admin/support");
}

// «Отметить все обработанными»: все новые письма, которые сейчас видны по фильтру (тема, поиск)
export async function markAllSupportEmailsHandledAction(formData: FormData) {
  const auth = await requireSuperAdmin();
  const where = supportWhere(supportFilter((k) => formData.get(k)));
  await db.supportEmail.updateMany({
    where: { AND: [where, { handledAt: null }] },
    data: { handledAt: new Date(), handledById: auth.user.id },
  });
  revalidatePath("/admin/support");
}

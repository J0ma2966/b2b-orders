"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAuth, requireSuperAdmin } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";

// «Выполнить действие от имени» пользователя поставщика без его пароля (ТЗ п. 63).
export async function startImpersonationAction(formData: FormData) {
  const auth = await requireSuperAdmin();
  const memberId = String(formData.get("memberId") ?? "");
  const member = await db.supplierMember.findUnique({ where: { id: memberId }, include: { user: true } });
  if (!member || !member.isActive || member.user.isSuperAdmin) redirect("/admin/suppliers");
  await db.session.update({
    where: { id: auth.session.id },
    data: { actingAsUserId: member.userId, activeSupplierId: member.supplierId },
  });
  await writeAudit({
    entity: "User",
    entityId: member.userId,
    action: "impersonate.start",
    actorRole: "SUPER_ADMIN",
    asSelf: true,
    supplierId: member.supplierId,
  });
  redirect(member.role === "COURIER" ? "/courier" : "/supplier");
}

export async function stopImpersonationAction() {
  const auth = await getAuth();
  if (!auth?.isImpersonating) redirect("/");
  await writeAudit({ entity: "User", entityId: auth.user.id, action: "impersonate.stop", actorRole: "SUPER_ADMIN", asSelf: true });
  await db.session.update({ where: { id: auth.session.id }, data: { actingAsUserId: null, activeSupplierId: null } });
  redirect("/admin/suppliers");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { changeUnitPrice } from "@/lib/pricing";
import { notifySupplierStaff } from "@/lib/notify";
import { supplierTransition } from "@/lib/statuses";
import type { FormState } from "@/lib/forms";

const ACTIONS = ["confirm", "reject", "watch", "disable_orders", "hide", "block"] as const;
type AntifraudAction = (typeof ACTIONS)[number];

// Решения по антифрод-событию (ТЗ п. 56). Все решения пишутся в аудит.
export async function resolveAntifraudAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const auth = await requireSuperAdmin();
  const action = String(formData.get("action")) as AntifraudAction;
  const comment = String(formData.get("comment") ?? "").trim() || null;
  if (!ACTIONS.includes(action)) return { error: "Неизвестное действие" };
  const event = await db.antifraudEvent.findUnique({
    where: { id: String(formData.get("eventId") ?? "") },
    include: { productUnit: { include: { product: true } }, supplier: true },
  });
  if (!event) return { error: "Событие не найдено" };
  if (action === "block" && !comment) return { error: "Укажите причину блокировки — её увидит поставщик" };

  await db.$transaction(async (tx) => {
    const resolved = { resolvedById: auth.realUser.id, resolvedAt: new Date(), resolution: comment };
    if (action === "confirm") await tx.antifraudEvent.update({ where: { id: event.id }, data: { status: "CONFIRMED", ...resolved } });
    if (action === "watch") await tx.antifraudEvent.update({ where: { id: event.id }, data: { status: "WATCHING", ...resolved } });
    if (action === "reject") {
      // Восстановить предыдущую цену, если её с тех пор не меняли
      const unit = event.productUnit;
      if (unit.price !== null && Number(unit.price) === Number(event.newPrice)) {
        await changeUnitPrice(tx, { ...unit, product: unit.product }, Number(event.oldPrice));
      }
      await tx.antifraudEvent.update({ where: { id: event.id }, data: { status: "REJECTED", ...resolved } });
    }
    if (action === "disable_orders") await tx.supplier.update({ where: { id: event.supplierId }, data: { ordersDisabled: true } });
    if (action === "hide") await tx.supplier.update({ where: { id: event.supplierId }, data: { hiddenFromShops: true } });
    if (action === "block") {
      const to = supplierTransition("block", event.supplier.status);
      if (to) {
        await tx.supplier.update({ where: { id: event.supplierId }, data: { status: to, moderationComment: comment } });
        await tx.supplierStatusHistory.create({ data: { supplierId: event.supplierId, fromStatus: event.supplier.status, toStatus: to, comment, userId: auth.realUser.id } });
      }
    }
    await writeAudit(
      { entity: "AntifraudEvent", entityId: event.id, action: `antifraud.${action}`, actorRole: "SUPER_ADMIN", supplierId: event.supplierId, comment },
      tx,
    );
    if (action === "reject" || action === "block" || action === "disable_orders" || action === "hide") {
      const titles = {
        reject: "Снижение цены отклонено, прежняя цена восстановлена",
        block: "Компания заблокирована по результатам проверки цен",
        disable_orders: "Новые заказы временно запрещены администратором",
        hide: "Компания временно скрыта из списка для магазинов",
      } as const;
      await notifySupplierStaff(event.supplierId, { type: "antifraud.decision", title: titles[action], body: `${event.productUnit.product.name}${comment ? `. ${comment}` : ""}`, link: "/supplier" }, ["OWNER", "ADMIN"], tx);
    }
  });
  revalidatePath("/admin/antifraud");
  // Решённое событие уходит из списка открытых вместе с формой, поэтому итог показывает сама страница
  redirect(`/admin/antifraud?saved=${action}`);
}

export async function restoreSupplierVisibilityAction(formData: FormData) {
  await requireSuperAdmin();
  const supplierId = String(formData.get("supplierId") ?? "");
  const field = String(formData.get("field"));
  if (field !== "ordersDisabled" && field !== "hiddenFromShops") return;
  await db.supplier.update({ where: { id: supplierId }, data: { [field]: false } });
  await writeAudit({ entity: "Supplier", entityId: supplierId, action: `antifraud.lift.${field}`, actorRole: "SUPER_ADMIN", supplierId, changes: [{ field, old: true, new: false }] });
  revalidatePath("/admin/antifraud");
  revalidatePath(`/admin/suppliers/${supplierId}`);
}

import type { SupplierRole } from "@/generated/prisma/enums";

// Кто кого может добавлять и отключать в команде поставщика.
// Владелец — всех; администратор — только доставщиков.
export function canManageMember(actor: SupplierRole, target: SupplierRole) {
  if (target === "OWNER") return false;
  if (actor === "OWNER") return true;
  return actor === "ADMIN" && target === "COURIER";
}

export function assignableRoles(actor: SupplierRole): SupplierRole[] {
  return (["ADMIN", "COURIER"] as const).filter((r) => canManageMember(actor, r));
}

// Кому можно назначать доставки: доставщику и владельцу или администратору, который
// развозит заказы сам (поставщик-ИП без своих доставщиков).
export function isDeliverer(m: { role: SupplierRole; delivers: boolean }) {
  return m.role === "COURIER" || m.delivers;
}

// Те же правила для запросов: активные сотрудники, которым можно назначить доставку.
export const delivererWhere = { isActive: true, OR: [{ role: "COURIER" as const }, { delivers: true }] };

// «Сам развожу заказы»: владелец включает себе и администраторам, администратор — только себе.
export function canSetDelivers(actor: SupplierRole, target: SupplierRole, self: boolean) {
  if (target === "COURIER") return false;
  return actor === "OWNER" || (actor === "ADMIN" && self);
}

// Касса доставщика (Д1): доставщик и администратор сдают наличные, владельцу сдавать некому.
export function handsOverCash(role: SupplierRole) {
  return role !== "OWNER";
}

// Роль в журнале действий
export function actorRoleTag(role: SupplierRole) {
  return role === "OWNER" ? "SUPPLIER_OWNER" : role === "ADMIN" ? "SUPPLIER_ADMIN" : "COURIER";
}

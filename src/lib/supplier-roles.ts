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

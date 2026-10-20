// Справочники статусов и допустимые переходы (без зависимостей, покрыто тестами).
import type { ShopStatus, SupplierStatus } from "@/generated/prisma/enums";

export const SUPPLIER_STATUS_LABEL: Record<SupplierStatus, string> = {
  PENDING: "На проверке",
  NEEDS_INFO: "Нужны сведения",
  ACTIVE: "Активен",
  REJECTED: "Отклонён",
  BLOCKED: "Заблокирован",
};

export const SUPPLIER_STATUS_COLOR = {
  PENDING: "yellow",
  NEEDS_INFO: "yellow",
  ACTIVE: "green",
  REJECTED: "red",
  BLOCKED: "red",
} as const satisfies Record<SupplierStatus, string>;

export type SupplierModerationAction = "approve" | "reject" | "request_info" | "block" | "unblock" | "resubmit";

const SUPPLIER_TRANSITIONS: Record<SupplierModerationAction, { from: SupplierStatus[]; to: SupplierStatus }> = {
  approve: { from: ["PENDING", "NEEDS_INFO"], to: "ACTIVE" },
  reject: { from: ["PENDING", "NEEDS_INFO"], to: "REJECTED" },
  request_info: { from: ["PENDING"], to: "NEEDS_INFO" },
  block: { from: ["PENDING", "NEEDS_INFO", "ACTIVE", "REJECTED"], to: "BLOCKED" },
  unblock: { from: ["BLOCKED"], to: "ACTIVE" },
  // Поставщик дополнил сведения или исправил отклонённую заявку
  resubmit: { from: ["NEEDS_INFO", "REJECTED"], to: "PENDING" },
};

export function supplierTransition(action: SupplierModerationAction, from: SupplierStatus): SupplierStatus | null {
  const t = SUPPLIER_TRANSITIONS[action];
  return t.from.includes(from) ? t.to : null;
}

export function availableSupplierActions(from: SupplierStatus): SupplierModerationAction[] {
  return (Object.keys(SUPPLIER_TRANSITIONS) as SupplierModerationAction[]).filter(
    (a) => a !== "resubmit" && SUPPLIER_TRANSITIONS[a].from.includes(from),
  );
}

export const SUPPLIER_ACTION_LABEL: Record<SupplierModerationAction, string> = {
  approve: "Подтвердить",
  reject: "Отклонить",
  request_info: "Запросить сведения",
  block: "Заблокировать",
  unblock: "Разблокировать",
  resubmit: "Отправить на проверку",
};

// Действия, где обязателен комментарий для поставщика
export const SUPPLIER_ACTION_NEEDS_COMMENT: SupplierModerationAction[] = ["reject", "request_info", "block"];

export const SHOP_STATUS_LABEL: Record<ShopStatus, string> = {
  NEW: "Новый",
  VERIFIED: "Проверенный",
  FAILED_CHECK: "Не прошёл проверку",
};

export const SHOP_STATUS_COLOR = {
  NEW: "blue",
  VERIFIED: "green",
  FAILED_CHECK: "red",
} as const satisfies Record<ShopStatus, string>;

export const SUPPLIER_ROLE_LABEL = { OWNER: "Владелец", ADMIN: "Администратор", COURIER: "Доставщик" } as const;

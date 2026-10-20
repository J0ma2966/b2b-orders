// Справочники замен и возвращённых товаров (ТЗ п. 45–49).
import type { ReplacementStatus, ReturnedStatus } from "@/generated/prisma/enums";

export const REPLACEMENT_REASONS = [
  "Брак",
  "Истёк срок годности",
  "Повреждена упаковка",
  "Привезли не тот товар",
  "Другое",
];

export const REPLACEMENT_STATUS_LABEL: Record<ReplacementStatus, string> = {
  NEW: "На рассмотрении",
  APPROVED: "Согласована",
  REJECTED: "Отклонена",
  ASSIGNED: "Передана доставщику",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
};

export const REPLACEMENT_STATUS_COLOR = {
  NEW: "blue",
  APPROVED: "yellow",
  REJECTED: "red",
  ASSIGNED: "yellow",
  DONE: "green",
  CANCELLED: "gray",
} as const satisfies Record<ReplacementStatus, string>;

export const RETURNED_STATUS_LABEL: Record<ReturnedStatus, string> = {
  PENDING_CHECK: "Ожидает проверки",
  CHECKED: "Проверен",
  USABLE: "Пригоден",
  DEFECTIVE: "Брак",
  WRITTEN_OFF: "Списан",
  DISPOSED: "Утилизирован",
  BACK_TO_STOCK: "Возвращён в оборот",
};

export const RETURNED_STATUS_COLOR = {
  PENDING_CHECK: "blue",
  CHECKED: "yellow",
  USABLE: "green",
  DEFECTIVE: "red",
  WRITTEN_OFF: "gray",
  DISPOSED: "gray",
  BACK_TO_STOCK: "green",
} as const satisfies Record<ReturnedStatus, string>;

// После этих статусов товар больше не меняется
export const RETURNED_FINAL: ReturnedStatus[] = ["WRITTEN_OFF", "DISPOSED", "BACK_TO_STOCK"];

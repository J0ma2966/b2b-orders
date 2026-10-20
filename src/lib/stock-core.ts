// Правила складских операций (без БД, покрыто тестами). ТЗ п. 18–20, 67.
import type { StockMovementType } from "@/generated/prisma/enums";

export type Deltas = { physical: number; reserved: number };

// Как операция меняет физический и зарезервированный остаток при количестве qty > 0.
// ADJUSTMENT принимает qty со знаком.
export function movementDeltas(type: StockMovementType, qty: number): Deltas {
  switch (type) {
    case "INITIAL":
    case "INCOME":
    case "BACK_TO_STOCK":
      return { physical: qty, reserved: 0 };
    case "WRITE_OFF":
      return { physical: -qty, reserved: 0 };
    case "ADJUSTMENT":
      return { physical: qty, reserved: 0 };
    case "RESERVE":
      return { physical: 0, reserved: qty };
    case "RELEASE":
    case "RETURN_UNACCEPTED":
      return { physical: 0, reserved: -qty };
    // Товар принят магазином: уходит из резерва и с физического остатка
    case "SALE":
    case "BONUS":
    case "FORCED_SALE":
    // Новый товар по замене передан магазину: из резерва и с остатка, без продажи
    case "REPLACEMENT_OUT":
      return { physical: -qty, reserved: -qty };
    // Забранный при замене товар идёт в «Возвращённые», основной остаток не меняется (ТЗ п. 48)
    case "TO_RETURNED":
      return { physical: 0, reserved: 0 };
  }
}

export function available(physical: number, reserved: number) {
  return physical - reserved;
}

// Остаток после операции допустим, если ничего не ушло в минус и резерв не больше физического.
export function isValidState(physical: number, reserved: number) {
  return physical >= 0 && reserved >= 0 && physical >= reserved;
}

export const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  INITIAL: "Начальный остаток",
  INCOME: "Приход",
  RESERVE: "Резервирование",
  RELEASE: "Освобождение резерва",
  SALE: "Продажа",
  BONUS: "Бонус",
  FORCED_SALE: "Принудительная продажа",
  RETURN_UNACCEPTED: "Возврат непринятого",
  TO_RETURNED: "В возвращённые товары",
  REPLACEMENT_OUT: "Выдача по замене",
  BACK_TO_STOCK: "Возврат в оборот",
  WRITE_OFF: "Списание",
  ADJUSTMENT: "Ручная корректировка",
};

// Снижение цены на 30% и более — антифрод-предупреждение (ТЗ п. 54)
export const ANTIFRAUD_DROP_PCT = 30;

export function priceChangePct(oldPrice: number, newPrice: number) {
  if (oldPrice <= 0) return 0;
  return Math.round(((newPrice - oldPrice) / oldPrice) * 10000) / 100;
}

export function isSuspiciousDrop(oldPrice: number | null, newPrice: number | null) {
  if (oldPrice === null || newPrice === null || oldPrice <= 0) return false;
  return priceChangePct(oldPrice, newPrice) <= -ANTIFRAUD_DROP_PCT;
}

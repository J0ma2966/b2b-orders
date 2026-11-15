// Подгрузка списков по 10 карточек (см. components/ui/load-more.tsx)
export const LOAD_STEP = 10;
export const LOAD_MAX = 500;

/** Сколько карточек показать: ?n=30 (шаг 10, по умолчанию 10) */
export function shownFrom(sp: Record<string, string | string[] | undefined>) {
  const n = Number(sp.n);
  if (!Number.isInteger(n) || n <= LOAD_STEP) return LOAD_STEP;
  return Math.min(LOAD_MAX, Math.ceil(n / LOAD_STEP) * LOAD_STEP);
}

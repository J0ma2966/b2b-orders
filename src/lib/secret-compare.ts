import { createHash, timingSafeEqual } from "node:crypto";

// Сравнение секрета из заголовка с ожидаемым за постоянное время. Сравниваются хеши: длина
// одинаковая при любом вводе, и timingSafeEqual не бросает исключение на строке с не-ASCII символами.
export function secretMatches(got: string, expected: string | undefined | null) {
  if (!expected) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(got), h(expected));
}

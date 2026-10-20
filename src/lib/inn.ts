// ИНН в Узбекистане: 9 цифр (юрлица и ИП), ПИНФЛ физлица: 14 цифр.
export function normalizeInn(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return digits.length === 9 || digits.length === 14 ? digits : null;
}

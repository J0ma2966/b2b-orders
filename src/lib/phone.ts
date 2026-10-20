// Телефоны храним в формате +998XXXXXXXXX (Узбекистан).
// Принимаем ввод вида "90 123 45 67", "+998 (90) 123-45-67", "998901234567".

const UZ_CODE = "998";

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let local: string;
  if (digits.length === 12 && digits.startsWith(UZ_CODE)) local = digits.slice(3);
  else if (digits.length === 9) local = digits;
  else return null;
  return `+${UZ_CODE}${local}`;
}

export function formatPhone(phone: string): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  if (!m) return phone;
  return `+998 ${m[1]} ${m[2]}-${m[3]}-${m[4]}`;
}

import { randomBytes } from "node:crypto";

// Пароль первого супер-администратора. Пустое значение (как в .env.example) — то же, что не задано.
// Без SUPERADMIN_PASSWORD пароль генерируется случайно и печатается один раз при npm run db:seed;
// при первом входе система попросит его сменить. Общеизвестного пароля по умолчанию нет.
export function initialSuperadminPassword(value: string | undefined) {
  const fixed = value?.trim() || null;
  if (fixed) return { password: fixed, mustChange: false, generated: false };
  return { password: randomBytes(9).toString("base64url"), mustChange: true, generated: true };
}

// Пароль первого супер-администратора. Пустое значение (как в .env.example) — то же, что не задано:
// иначе пароль был бы пустой строкой, а смена при первом входе не потребовалась бы.
export function initialSuperadminPassword(value: string | undefined) {
  const fixed = value?.trim() || null;
  return { password: fixed ?? "admin12345", mustChange: !fixed };
}

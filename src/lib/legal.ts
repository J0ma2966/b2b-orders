// Реквизиты владельца платформы для политики конфиденциальности и страницы удаления аккаунта.
// Задаются в .env; те же адреса указываются в App Store Connect и Google Play Console.
export function legalInfo() {
  return {
    operator: process.env.LEGAL_OPERATOR_NAME || "Владелец платформы (укажите LEGAL_OPERATOR_NAME)",
    // Без отдельного адреса — ящик техподдержки (b2b-support-mail)
    email: process.env.LEGAL_CONTACT_EMAIL || process.env.SUPPORT_IMAP_USER || "support@example.uz",
    phone: process.env.LEGAL_CONTACT_PHONE || null,
    updated: "29.10.2026",
  };
}

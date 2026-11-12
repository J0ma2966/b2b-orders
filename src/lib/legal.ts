// Реквизиты владельца платформы для политики конфиденциальности и страницы удаления аккаунта.
// Задаются в .env; те же адреса указываются в App Store Connect и Google Play Console.
export function legalInfo() {
  return {
    operator: process.env.LEGAL_OPERATOR_NAME || "Владелец платформы (укажите LEGAL_OPERATOR_NAME)",
    // Ящик техподдержки (b2b-support-mail), иначе общий адрес для связи
    email: process.env.SUPPORT_MAIL_ADDRESS || process.env.SUPPORT_IMAP_USER || process.env.LEGAL_CONTACT_EMAIL || "support@example.uz",
    phone: process.env.LEGAL_CONTACT_PHONE || null,
    updated: "29.10.2026",
  };
}

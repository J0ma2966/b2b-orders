// Темы обращений в поддержку. Ссылки «написать на почту» с сайта сразу ставят тему в начало темы письма:
// «[OptoLink: Удаление аккаунта]». Платформа узнаёт её во входящем письме (topicFromSubject),
// и в разделе «Поддержка» письма можно отобрать по теме.

export const SUPPORT_TOPICS = [
  { code: "privacy", ru: "Персональные данные", uz: "Shaxsiy ma’lumotlar" },
  { code: "deletion", ru: "Удаление аккаунта", uz: "Hisobni oʻchirish" },
  { code: "blocked", ru: "Блокировка", uz: "Bloklash" },
  { code: "moderation", ru: "Проверка заявки", uz: "Arizani tekshirish" },
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number]["code"];

export const isSupportTopic = (v: unknown): v is SupportTopic => SUPPORT_TOPICS.some((x) => x.code === v);

export function supportTopicLabel(code: SupportTopic, locale: "ru" | "uz" = "ru") {
  const x = SUPPORT_TOPICS.find((t) => t.code === code)!;
  return locale === "uz" ? x.uz : x.ru;
}

export function supportSubject(code: SupportTopic, locale: "ru" | "uz" = "ru") {
  return `[OptoLink: ${supportTopicLabel(code, locale)}]`;
}

// mailto: с темой (и, если нужно, началом текста письма)
export function supportMailto(email: string, code: SupportTopic, locale: "ru" | "uz" = "ru", body?: string) {
  const to = encodeURIComponent(email).replace(/%40/g, "@");
  const q = `subject=${encodeURIComponent(supportSubject(code, locale))}${body ? `&body=${encodeURIComponent(body)}` : ""}`;
  return `mailto:${to}?${q}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[’ʼ'`ʻ‘]/g, "'").replace(/\s+/g, " ").trim();

// Тема по теме письма: «[OptoLink: …]» где угодно в строке, в том числе после «Re:», «Fwd:».
// Узнаёт и русское, и узбекское название. Без метки — null.
export function topicFromSubject(subject: string | null | undefined): SupportTopic | null {
  const m = /\[\s*OptoLink\s*:\s*([^\]]+)\]/i.exec(subject ?? "");
  if (!m) return null;
  const label = norm(m[1]);
  return SUPPORT_TOPICS.find((t) => norm(t.ru) === label || norm(t.uz) === label)?.code ?? null;
}

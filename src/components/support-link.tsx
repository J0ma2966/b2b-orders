import type { ReactNode } from "react";
import { getLocale } from "@/lib/i18n/server";
import { legalInfo } from "@/lib/legal";
import { supportMailto, type SupportTopic } from "@/lib/support-topics";

// Ссылка «написать в поддержку»: открывает почту с адресом поддержки и темой «[OptoLink: тема]»
export async function SupportLink({ topic, body, children, className = "text-brand-600" }: { topic: SupportTopic; body?: string; children?: ReactNode; className?: string }) {
  const [locale, L] = [await getLocale(), legalInfo()];
  return (
    <a href={supportMailto(L.email, topic, locale, body)} className={className}>
      {children ?? L.email}
    </a>
  );
}

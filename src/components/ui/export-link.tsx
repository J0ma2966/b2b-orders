import { getT } from "@/lib/i18n/server";

// П7: ссылка на выгрузку в Excel с текущими фильтрами страницы
export async function ExportLink({ href }: { href: string }) {
  const t = await getT();
  return (
    <a href={href} download className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
      <span aria-hidden>⤓</span>
      {t("Скачать в Excel")}
    </a>
  );
}

"use client";

import { useT } from "@/lib/i18n/client";

export function PrintBar({ back }: { back: string }) {
  const t = useT();
  return (
    <div className="mb-4 flex justify-between print:hidden">
      <button type="button" onClick={() => history.length > 1 ? history.back() : (location.href = back)} className="text-brand-600">{t("← Назад")}</button>
      <button type="button" onClick={() => window.print()} className="rounded-lg bg-brand-600 px-4 py-2 text-on-brand">{t("Печать / PDF")}</button>
    </div>
  );
}

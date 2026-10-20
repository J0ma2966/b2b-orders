"use client";

import { useTransition } from "react";
import { setLocaleAction } from "@/app/locale-actions";
import { LOCALES, type Locale } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/client";
import { cn } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

const SHORT: Record<Locale, string> = { ru: "Рус", uz: "Oʻzb" };

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useT();
  const current = useLocale();
  const [pending, start] = useTransition();
  return (
    <div className={cn("inline-flex rounded-lg p-0.5 text-xs ring-1 ring-gray-200", pending && "opacity-60", className)} role="group" aria-label={t("Язык / Til")}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === current}
          disabled={pending}
          onClick={() => {
            if (l === current) return;
            const fd = new FormData();
            fd.set("locale", l);
            start(() => setLocaleAction(fd));
          }}
          className={cn("rounded-md px-2 py-1", l === current ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-100")}
        >
          {SHORT[l]}
        </button>
      ))}
    </div>
  );
}

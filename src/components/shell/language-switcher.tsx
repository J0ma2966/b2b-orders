"use client";

import { useTransition } from "react";
import { setLocaleAction } from "@/app/locale-actions";
import { LOCALES, type Locale } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/client";
import { cn } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

const SHORT: Record<Locale, string> = { ru: "Рус", uz: "Oʻzb" };

// onDark — для цветной шапки витрины магазина
export function LanguageSwitcher({ className, onDark }: { className?: string; onDark?: boolean }) {
  const t = useT();
  const current = useLocale();
  const [pending, start] = useTransition();
  return (
    <div className={cn("inline-flex rounded-full p-0.5 text-xs ring-1", onDark ? "ring-white/30" : "ring-gray-200", pending && "opacity-60", className)} role="group" aria-label={t("Язык / Til")}>
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
          className={cn(
            "rounded-full px-2.5 py-1 font-medium",
            l === current ? (onDark ? "bg-white text-brand-700" : "bg-brand-600 text-on-brand") : onDark ? "text-white/80 hover:bg-white/10" : "text-gray-600 hover:bg-gray-100",
          )}
        >
          {SHORT[l]}
        </button>
      ))}
    </div>
  );
}

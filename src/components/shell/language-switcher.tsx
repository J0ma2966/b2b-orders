"use client";

import { useTransition } from "react";
import { setLocaleAction } from "@/app/locale-actions";
import { LOCALES, type Locale } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/client";
import { cn } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

const SHORT: Record<Locale, string> = { ru: "Рус", uz: "Oʻzb" };
// В тёмной шапке главной — как в макете: UZ / RU
const CODE: Record<Locale, string> = { ru: "RU", uz: "UZ" };
// В профиле — переключатель на всю ширину с полными названиями
const FULL: Record<Locale, string> = { ru: "Русский", uz: "Oʻzbekcha" };

// onDark — для тёмной шапки витрины на компьютере, onNight — для большой тёмной шапки главной магазина на телефоне,
// wide — для профиля магазина
export function LanguageSwitcher({ className, onDark, onNight, wide }: { className?: string; onDark?: boolean; onNight?: boolean; wide?: boolean }) {
  const t = useT();
  const current = useLocale();
  const [pending, start] = useTransition();
  return (
    <div
      className={cn(
        wide ? "grid grid-cols-2 gap-1 rounded-2xl bg-page p-1.5 text-base" : "inline-flex shrink-0 rounded-full",
        !wide && (onNight ? "bg-night-2 p-1 text-sm font-bold" : "p-0.5 text-xs ring-1"),
        !wide && !onNight && (onDark ? "ring-white/30" : "ring-gray-200"),
        pending && "opacity-60",
        className,
      )}
      role="group"
      aria-label={t("Язык / Til")}
    >
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
            wide ? "rounded-xl py-3 font-bold transition-colors" : "rounded-full font-medium",
            wide ? "" : onNight ? "px-3 py-1.5" : "px-2.5 py-1",
            l === current
              ? wide
                ? "bg-night text-lime"
                : onNight
                ? "bg-white font-bold text-night"
                : onDark
                  ? "bg-white text-night"
                  : "bg-brand-600 text-on-brand"
              : wide
                ? "text-gray-500"
                : onNight || onDark
                ? "text-white/60 hover:text-white"
                : "text-gray-600 hover:bg-gray-100",
          )}
        >
          {wide ? FULL[l] : onNight ? CODE[l] : SHORT[l]}
        </button>
      ))}
    </div>
  );
}

"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { makeT, type Locale } from "./core";

const LocaleContext = createContext<Locale>("ru");

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT() {
  return makeT(useContext(LocaleContext));
}

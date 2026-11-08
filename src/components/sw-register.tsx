"use client";

import { useEffect } from "react";

// Регистрация service worker для установки PWA на телефон.
// В `npm run dev` имена файлов /_next/static/* не меняются при правке кода, поэтому
// service worker с `?dev=1` их не сохраняет: иначе браузер получал бы старые скрипты
// (ошибки «hydration mismatch», правки не видны до очистки кэша).
export const SW_URL = process.env.NODE_ENV === "development" ? "/sw.js?dev=1" : "/sw.js";

export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_URL).catch(() => null);
  }, []);
  return null;
}

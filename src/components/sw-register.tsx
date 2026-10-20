"use client";

import { useEffect } from "react";

// Регистрация service worker для установки PWA на телефон
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => null);
  }, []);
  return null;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const EVERY = 30_000;

// Обновляет открытую страницу, когда у пользователя появилось новое уведомление: поставщик
// видит новый заказ, доставщик — назначение, магазин — смену статуса без перезагрузки.
// Опрос идёт, только пока вкладка видна; при возврате на вкладку — сразу.
export function LiveRefresh({ stamp }: { stamp: string }) {
  const router = useRouter();
  const current = useRef(stamp);
  useEffect(() => {
    current.current = stamp;
  }, [stamp]);

  useEffect(() => {
    let stopped = false;
    async function check() {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const { stamp: fresh } = (await res.json()) as { stamp: string | null };
        if (fresh !== null && fresh !== current.current) {
          current.current = fresh;
          router.refresh();
        }
      } catch {}
    }
    const timer = setInterval(check, EVERY);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", check);
    };
  }, [router]);

  return null;
}

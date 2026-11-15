"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import { LOAD_MAX, LOAD_STEP } from "@/lib/load-more";

// Подгрузка списка при прокрутке: когда пользователь доходит до конца, показываем ещё 10 карточек.
// Число показанных хранится в адресе (?n=…), поэтому счётчики корзины на карточках остаются верными
// после любого обновления страницы, а «Назад» возвращает к тому же месту списка.
export function LoadMore({ shown, total, basePath, params }: { shown: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const asked = useRef(0);
  const more = shown < total && shown < LOAD_MAX;

  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  q.set("n", String(shown + LOAD_STEP));
  const href = `${basePath}?${q.toString()}`;

  const load = () => {
    if (asked.current >= shown + LOAD_STEP) return;
    asked.current = shown + LOAD_STEP;
    start(() => router.replace(href, { scroll: false }));
  };
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !more || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadRef.current(), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, shown]);

  if (!more) return total > LOAD_STEP ? <p className="mt-4 text-center text-xs text-gray-500" data-testid="load-more-end">{t("Показаны все: {n}", { n: total })}</p> : null;
  return (
    <div ref={ref} className="mt-4 flex min-h-12 items-center justify-center" data-testid="load-more" data-shown={shown}>
      {pending ? (
        <span className="flex items-center gap-2 text-sm text-gray-500" role="status">
          <span className="size-5 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" aria-hidden />
          {t("Загрузка…")}
        </span>
      ) : (
        <button type="button" onClick={load} className="min-h-11 rounded-full px-5 text-sm font-semibold ring-1 ring-black/10 hover:bg-black/5">
          {t("Показать ещё")}
        </button>
      )}
    </div>
  );
}

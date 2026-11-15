"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Сообщение формы прокручивается в видимую часть экрана, если появилось за её пределами:
// кнопка «Сохранить» внизу длинной формы, а ошибка наверху — без этого её не видно.
// signal — объект ответа сервера: новая отправка формы даёт новый объект.
export function Reveal({ signal, children }: { signal: unknown; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = 72; // липкая шапка
    const bottom = window.innerHeight - 96; // нижнее меню приложения
    if (r.top < top || r.bottom > bottom) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [signal]);
  return <div ref={ref} data-form-message>{children}</div>;
}

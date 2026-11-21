"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// Плавающая нижняя панель (корзина, «В корзину», «Итого»). Сама сообщает, сколько места снизу экрана она
// закрывает, через CSS-переменную --bottom-bar на <html>: нижний отступ <main> берёт её в расчёт, и
// последний товар можно докрутить до панели — на телефоне, ПК, с длинным узбекским текстом и с вырезом экрана.
export function FixedBottom({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => {
      const covered = Math.max(0, Math.ceil(window.innerHeight - el.getBoundingClientRect().top));
      root.style.setProperty("--bottom-bar", `${covered}px`);
      root.dataset.bottomBar = "1";
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--bottom-bar");
      delete root.dataset.bottomBar;
    };
  }, []);
  return (
    <div ref={ref} className={className} data-fixed-bottom>
      {children}
    </div>
  );
}

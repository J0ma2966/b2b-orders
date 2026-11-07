"use client";

import { useEffect, useRef, useState } from "react";

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

// Число плавно «досчитывает» до значения (выручка, долг магазина). При «Уменьшить движение» — сразу.
// from — с какого значения начать (после оплаты долг считается от прежней суммы к новой).
export function CountUp({ value, from = 0, className }: { value: number; from?: number; className?: string }) {
  const [shown, setShown] = useState(from);
  const prev = useRef(from);
  useEffect(() => {
    const start = prev.current;
    prev.current = value;
    if (start === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      setShown(start + (value - start) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{fmt.format(Math.round(shown)).replace(/ /g, " ")}</span>;
}

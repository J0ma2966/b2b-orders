"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui";

/** Только цифры; group — разбивка на разряды пробелом («5 000 000»). */
export function formatDigits(raw: string, opts: { group?: boolean; maxLength?: number; max?: number } = {}) {
  let d = raw.replace(/\D/g, "");
  if (opts.maxLength) d = d.slice(0, opts.maxLength);
  if (d.length > 1) d = d.replace(/^0+(?=\d)/, "");
  if (opts.max !== undefined && d !== "" && Number(d) > opts.max) d = String(opts.max);
  return opts.group ? d.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : d;
}

type Props = Omit<ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue" | "max"> & {
  defaultValue?: string;
  /** Разбивать на разряды: 5 000 000. Сервер должен убирать пробелы. */
  group?: boolean;
  max?: number;
};

/**
 * Числовое поле: на телефоне открывает цифровую клавиатуру и не даёт ввести
 * ничего, кроме цифр (в т.ч. при вставке).
 */
export function NumInput({ defaultValue = "", group, max, maxLength, ...props }: Props) {
  const fmt = (s: string) => formatDigits(s, { group, max, maxLength: maxLength ?? (group ? 13 : undefined) });
  const [value, setValue] = useState(() => fmt(defaultValue));
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      pattern="[0-9 ]*"
      autoComplete="off"
      value={value}
      onChange={(e) => setValue(fmt(e.target.value))}
    />
  );
}

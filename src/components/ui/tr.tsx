"use client";

import { useT } from "@/lib/i18n/client";
import type { Params } from "@/lib/i18n/core";

// Перевод строки там, где нет t: в общих компонентах и синхронных серверных компонентах
export function Tr({ children, text, params }: { children?: string; text?: string; params?: Params }) {
  return useT()(text ?? children ?? "", params);
}

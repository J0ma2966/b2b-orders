import type { ReactNode } from "react";
import { Tr } from "./tr";

// Строки переводятся, остальное содержимое выводится как есть.
// Отдельный модуль без "use client": tr вызывается и из серверных компонентов.
export function tr(node: ReactNode): ReactNode {
  return typeof node === "string" ? <Tr>{node}</Tr> : node;
}

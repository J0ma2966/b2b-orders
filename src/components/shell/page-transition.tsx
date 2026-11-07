import { ViewTransition, type ReactNode } from "react";

// Обёртка страницы для плавной смены (подключается в template.tsx разделов: шаблон создаётся заново
// при каждом переходе, поэтому срабатывают появление и уход). Анимации — в globals.css:
// по ссылке страница поднимается снизу, по вкладке нижней панели — мягко проявляется.
// Обновления данных (живое обновление, отправка форм) страницу не анимируют.
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={{ tab: "tab-in", default: "page-in" }} exit={{ tab: "tab-out", default: "page-out" }} default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}

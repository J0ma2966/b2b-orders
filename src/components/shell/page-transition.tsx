import { ViewTransition, type ReactNode } from "react";

// Обёртка страницы для плавной смены (подключается в template.tsx разделов: шаблон создаётся заново
// при каждом переходе, поэтому срабатывают появление и уход). Анимации — в globals.css:
// по ссылке страница поднимается снизу (в приложении поставщика — въезжает справа, push),
// по вкладке нижней панели — мягко проявляется, по «Назад» — въезжает слева.
// Обновления данных (живое обновление, отправка форм) страницу не анимируют.
export function PageTransition({ children, push }: { children: ReactNode; push?: boolean }) {
  return (
    <ViewTransition enter={{ tab: "tab-in", back: "back-in", default: push ? "push-in" : "page-in" }} exit={{ tab: "tab-out", default: "page-out" }} default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}

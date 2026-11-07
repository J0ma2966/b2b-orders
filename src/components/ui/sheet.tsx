"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./index";
import { tapHaptic } from "@/lib/native";

const SheetContext = createContext<{ close: () => void } | null>(null);
// Форма внутри шторки закрывает её после успешной отправки
export const useSheet = () => useContext(SheetContext);

// Нижняя шторка: на телефоне поднимается снизу, на компьютере — окно по центру снизу.
// Содержимое всегда в DOM (форма не теряет введённое), пока закрыта — недоступна (inert).
// Шторка выносится в body: внутри анимированных блоков (появление по очереди) fixed отсчитывался бы от блока.
export function Sheet({
  trigger,
  triggerClassName,
  title,
  subtitle,
  children,
  testId,
  theme,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  testId?: string;
  // Тема раздела (data-theme): в body шторка уже вне каркаса с темой
  theme?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const layer = (
      <div className={cn("fixed inset-0 z-[1100]", !open && "pointer-events-none")} aria-hidden={!open || undefined}>
        <div className={cn("sheet-scrim absolute inset-0 bg-[#17132a]/45", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          inert={!open}
          data-testid={testId}
          data-open={open || undefined}
          className={cn(
            "sheet-panel absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[1.75rem] bg-surface px-5 pt-2.5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl",
            "md:inset-x-auto md:bottom-8 md:left-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:rounded-[1.75rem]",
            open ? "translate-y-0" : "translate-y-[110%] md:translate-y-[130%]",
          )}
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-200 md:hidden" aria-hidden />
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold">{title}</h3>
              {subtitle && <div className="mt-0.5 text-sm text-gray-500">{subtitle}</div>}
            </div>
            <button type="button" onClick={() => setOpen(false)} className="-mt-1 -mr-2 grid size-10 place-items-center rounded-full text-gray-400 hover:bg-gray-100" aria-label="×">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <SheetContext value={{ close: () => setOpen(false) }}>{children}</SheetContext>
        </div>
      </div>
  );
  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          tapHaptic();
          setOpen(true);
        }}
      >
        {trigger}
      </button>
      {mounted ? createPortal(<div data-theme={theme} className="contents">{layer}</div>, document.body) : layer}
    </>
  );
}

const noop = () => () => {};

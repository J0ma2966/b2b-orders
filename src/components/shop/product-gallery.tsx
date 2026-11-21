"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

// Фото товара на странице товара: показываем целиком (object-contain на белом фоне),
// миниатюры переключают главное фото, нажатие открывает фото на весь экран.
export function ProductGallery({
  photos,
  fallback,
}: {
  photos: string[];
  fallback: React.ReactNode;
}) {
  const t = useT();
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const src = photos[active] ?? photos[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!src) {
    return (
      <div className="mx-auto mt-2 grid aspect-square w-[78%] max-w-80 place-items-center overflow-hidden rounded-[2rem] bg-white/40">
        {fallback}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("Открыть фото")}
        className="relative mx-auto mt-2 block aspect-square w-[82%] max-w-80 overflow-hidden rounded-[2rem] bg-white shadow-sm"
      >
        <img
          src={src}
          alt=""
          className="absolute inset-0 size-full object-contain p-3"
        />
      </button>
      {photos.length > 1 && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {photos.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => setActive(i)}
              aria-label={t("Фото {n}", { n: i + 1 })}
              aria-pressed={i === active}
              className={cn(
                "relative size-12 overflow-hidden rounded-xl bg-white ring-2",
                i === active ? "ring-night" : "ring-white/60",
              )}
            >
              <img
                src={p}
                alt=""
                className="absolute inset-0 size-full object-contain p-0.5"
              />
            </button>
          ))}
        </div>
      )}
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 p-4"
            onClick={() => setOpen(false)}
          >
            <img
              src={src}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("Закрыть")}
              className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 grid size-10 place-items-center rounded-full bg-white/15 text-2xl leading-none text-white"
            >
              ×
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

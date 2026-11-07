"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isNativeApp } from "@/lib/native";

// Всплывающее сообщение поверх страницы: «Заказ оформлен», push, пришедший при открытом приложении.
// showToast можно вызвать из любого клиентского кода; ToastHost (в корневом layout) показывает очередь по одному.

export type ToastInput = { title: string; body?: string; tone?: "success" | "info"; href?: string };
type Item = ToastInput & { id: number };

const EVENT = "app-toast";
let seq = 0;

export function showToast(t: ToastInput) {
  window.dispatchEvent(new CustomEvent<Item>(EVENT, { detail: { ...t, id: ++seq } }));
  if (t.tone === "success" && isNativeApp()) {
    import("@capacitor/haptics").then(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success })).catch(() => null);
  }
}

const SHOW_MS = 4500;

export function ToastHost() {
  const [items, setItems] = useState<Item[]>([]);
  const router = useRouter();
  const current = items[0];

  useEffect(() => {
    const on = (e: Event) => setItems((list) => [...list, (e as CustomEvent<Item>).detail].slice(-3));
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setItems((list) => list.slice(1)), SHOW_MS);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;
  const close = () => setItems((list) => list.slice(1));
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[2000] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]" aria-live="polite">
      <div
        key={current.id}
        role="status"
        data-testid="toast"
        className="toast-in pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.45)]"
        style={{ background: "#14171f", color: "#fff" }}
      >
        <span
          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-sm font-bold"
          style={{ background: current.tone === "success" ? "#22c55e" : "#3b82f6", color: "#fff" }}
          aria-hidden
        >
          {current.tone === "success" ? "✓" : "i"}
        </span>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => {
            close();
            if (current.href) router.push(current.href);
          }}
        >
          <span className="block text-[15px] leading-snug font-semibold">{current.title}</span>
          {current.body && <span className="mt-0.5 block text-sm leading-snug opacity-80">{current.body}</span>}
        </button>
        <button type="button" onClick={close} className="-mr-1 shrink-0 rounded-full px-1.5 text-lg leading-none opacity-60 hover:opacity-100" aria-label="×">
          ×
        </button>
      </div>
    </div>
  );
}

// Сообщение после перехода (например, ?placed=1 после «Оформить заказ»): показать один раз
// и убрать параметр из адреса, чтобы «Обновить» и «Назад» не показывали его снова.
export function FlashToast({ param, ...toast }: ToastInput & { param: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const url = new URL(window.location.href);
    // Уже показано (повторный запуск эффекта, возврат на страницу)
    if (!url.searchParams.has(param)) return;
    showToast(toast);
    url.searchParams.delete(param);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, param]);
  return null;
}

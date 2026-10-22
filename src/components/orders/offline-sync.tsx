"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { confirmDeliveryAction } from "@/app/courier/actions";
import { initialFormState, type FormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";
import {
  announceQueue,
  browserStore,
  clearDraft,
  isNetworkError,
  markQueuedError,
  QUEUE_EVENT,
  QUEUE_KEY,
  readQueue,
  removeQueued,
  toFormData,
  warmPages,
  type QueuedAcceptance,
} from "@/lib/offline-queue";

// Д4: отправляет приёмки, сохранённые без сети, как только связь вернулась,
// и показывает доставщику, что ещё не ушло на сервер.
export function OfflineSync({ userId }: { userId: string }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const raw = useSyncExternalStore(subscribeQueue, queueSnapshot, () => null);
  const queue = useMemo<QueuedAcceptance[]>(() => {
    const store = browserStore();
    return raw && store ? readQueue(store, userId) : [];
  }, [raw, userId]);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);

  const sync = useCallback(async () => {
    const store = browserStore();
    if (!store || busy.current || !navigator.onLine) return;
    const pending = readQueue(store, userId).filter((e) => !e.error);
    if (!pending.length) return;
    busy.current = true;
    setSending(true);
    let sent = false;
    try {
      for (const e of pending) {
        let r: FormState | undefined;
        try {
          r = await confirmDeliveryAction(initialFormState, toFormData(e.fields));
        } catch (err) {
          if (isNetworkError(err, navigator.onLine)) break;
          markQueuedError(store, e.id, "Не удалось отправить приёмку. Откройте заказ и отправьте ещё раз");
          continue;
        }
        if (!r) break; // сессия закончилась — приложение уже уводит на вход
        if (r.ok) {
          removeQueued(store, e.id);
          clearDraft(store, e.orderId);
          warmPages([`/courier/orders/${e.orderId}`, "/courier"], { force: true });
          sent = true;
        } else markQueuedError(store, e.id, r.error ?? "Не удалось отправить приёмку. Откройте заказ и отправьте ещё раз");
      }
    } finally {
      busy.current = false;
      setSending(false);
      announceQueue();
      if (sent) router.refresh();
    }
  }, [userId, router]);

  useEffect(() => {
    const first = setTimeout(sync, 0);
    window.addEventListener("online", sync);
    // Событие «online» приходит не на всех телефонах — проверяем и по таймеру
    const timer = setInterval(sync, 30_000);
    return () => {
      window.removeEventListener("online", sync);
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [sync]);

  // Открытая страница сохраняется для работы без сети (service worker решает, какие можно)
  useEffect(() => {
    if (navigator.onLine) warmPages([pathname]);
  }, [pathname]);

  const waiting = queue.filter((e) => !e.error);
  const failed = queue.filter((e) => e.error);
  if (online && !queue.length) return null;
  return (
    <div className="mb-4 space-y-2" role="status">
      {!online && (
        <p className="rounded-xl bg-yellow-50 px-4 py-3 text-sm text-yellow-800">{t("Нет сети. Доставки открываются из сохранённых на телефоне")}</p>
      )}
      {waiting.length > 0 && (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-gray-200">
          <b>{t("Ждут отправки: {n}", { n: waiting.length })}</b>
          <br />
          <span className="text-gray-500">{sending ? t("Отправляю сохранённые приёмки…") : t("Приёмки отправятся сами, когда появится связь")}</span>
        </p>
      )}
      {failed.map((e) => (
        <div key={e.id} className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <b>{t("Не отправлена приёмка {title}", { title: e.title })}</b>: {t(e.error!)}{" "}
          <Link className="font-semibold underline" href={`/courier/orders/${e.orderId}`}>{t("Открыть")}</Link>
        </div>
      ))}
    </div>
  );
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function subscribeQueue(cb: () => void) {
  window.addEventListener(QUEUE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(QUEUE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

// Снимок — строка из хранилища: пока она та же, список не пересчитывается
function queueSnapshot() {
  return browserStore()?.getItem(QUEUE_KEY) ?? null;
}

// Список доставок: сохранить страницы всех заказов, чтобы открыть их без сети
export function WarmPages({ urls }: { urls: string[] }) {
  const key = urls.join(" ");
  useEffect(() => {
    if (navigator.onLine) warmPages(["/courier", ...key.split(" ").filter(Boolean)], { prune: true });
  }, [key]);
  return null;
}

"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { savePushSubscriptionAction, setPushEnabledAction } from "./push-actions";

function keyToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Push управляется отдельно; уведомления в колокольчике сохраняются всегда (ТЗ п. 57)
export function PushSettings({ enabled, devices, publicKey }: { enabled: boolean; devices: number; publicKey: string | null }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function subscribe() {
    setMessage(null);
    if (!publicKey) return setMessage("Push не настроен на сервере");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setMessage("Браузер не поддерживает push. На iPhone добавьте приложение на главный экран.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return setMessage("Уведомления запрещены в настройках браузера");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const r = await savePushSubscriptionAction(json);
    setMessage(r.error ?? "Push включён на этом устройстве");
  }

  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={enabled} disabled={pending} onChange={(e) => start(() => setPushEnabledAction(e.target.checked))} />
        {t("Присылать push-уведомления")}
      </label>
      <p className="text-gray-500">{t("Устройств с push: {n}. Уведомления в колокольчике сохраняются независимо от этой настройки.", { n: devices })}</p>
      <Button type="button" variant="secondary" disabled={pending} onClick={() => start(subscribe)}>{t("🔔 Включить push на этом устройстве")}</Button>
      {message && <p className="text-gray-700">{t(message)}</p>}

    </div>
  );
}

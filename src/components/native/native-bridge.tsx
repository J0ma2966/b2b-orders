"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp, nativePlatform, shareDownload } from "@/lib/native";
import { safePath } from "@/lib/push-path";
import { showToast } from "@/components/ui/toast";

// Поведение сайта внутри мобильного приложения: ссылки, выгрузки, переход по нажатию на push.
// В обычном браузере ничего не делает.
export function NativeBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.dataset.native = nativePlatform() ?? "";

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const url = new URL(a.href, location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return; // tel:, mailto: открывает система
      if (url.origin !== location.origin) {
        // Карты, маршруты — во внешнем приложении (Яндекс Карты, Google Maps) или браузере
        e.preventDefault();
        location.href = url.href;
        return;
      }
      if (a.hasAttribute("download")) {
        e.preventDefault();
        shareDownload(url.href).catch(() => alert("Не удалось скачать файл. Проверьте интернет."));
        return;
      }
      if (a.target === "_blank") {
        // Новых окон во встроенном браузере нет — открываем здесь же, «Назад» вернёт обратно
        e.preventDefault();
        location.href = url.href;
      }
    }
    document.addEventListener("click", onClick);

    const handles: Promise<{ remove: () => Promise<void> }>[] = [];
    import("@capacitor/push-notifications").then(({ PushNotifications }) => {
      handles.push(
        PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
          router.push(safePath((a.notification.data as { url?: string } | undefined)?.url));
        }),
        // Push пришёл, когда приложение открыто: Android сам его не показывает (iOS показывает баннер),
        // поэтому — всплывающее сообщение с переходом по нажатию; страница и счётчики обновляются
        PushNotifications.addListener("pushNotificationReceived", (n) => {
          if (nativePlatform() === "android" && n.title) {
            showToast({ title: n.title, body: n.body, tone: "info", href: safePath((n.data as { url?: string } | undefined)?.url) });
          }
          router.refresh();
        }),
      );
    });

    return () => {
      document.removeEventListener("click", onClick);
      handles.forEach((h) => h.then((x) => x.remove()));
    };
  }, [router]);

  return null;
}

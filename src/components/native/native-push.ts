"use client";

import { nativePlatform } from "@/lib/native";
import { saveDeviceTokenAction } from "@/app/(common)/account/push-actions";

export type NativePushConfig = { android: boolean; ios: boolean };

// Push в мобильном приложении: разрешение → токен FCM/APNs → сервер.
// prompt=false — только обновить токен, если разрешение уже дано (без окна с вопросом).
// Возвращает текст ошибки или null.
export async function registerNativePush(config: NativePushConfig, prompt: boolean): Promise<string | null> {
  const platform = nativePlatform();
  if (!platform) return "Браузер не поддерживает push";
  // Без ключей на сервере (и google-services.json в сборке Android) регистрация бесполезна
  if (!config[platform]) return "Push не настроен на сервере";
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive !== "granted" && perm.receive !== "denied") {
    if (!prompt) return null;
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return prompt ? "Уведомления запрещены в настройках телефона" : null;

  const token = await new Promise<string>((resolve, reject) => {
    const handles = [
      PushNotifications.addListener("registration", (t) => {
        done();
        resolve(t.value);
      }),
      PushNotifications.addListener("registrationError", (e) => {
        done();
        reject(new Error(e.error));
      }),
    ];
    const done = () => handles.forEach((h) => h.then((x) => x.remove()));
    PushNotifications.register().catch(reject);
  });
  const r = await saveDeviceTokenAction({ platform, token });
  return r.error ?? null;
}

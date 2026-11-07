"use client";

import { registerPlugin } from "@capacitor/core";
import { nativePlatform } from "@/lib/native";
import { saveDeviceTokenAction } from "@/app/(common)/account/push-actions";

export type NativePushConfig = { android: boolean; ios: boolean };

const ASKED = "native-push-asked";

// Свой плагин Android (mobile/android/…/PushStatusPlugin.java): собрано ли приложение с google-services.json
const PushStatus = registerPlugin<{ status(): Promise<{ firebase: boolean }> }>("PushStatus");

async function firebaseInBuild(platform: "android" | "ios") {
  if (platform === "ios") return true; // iOS работает через APNs напрямую, Firebase не нужен
  // Старая сборка без плагина — считаем, что Firebase нет: register() без него роняет приложение
  return PushStatus.status()
    .then((s) => s.firebase)
    .catch(() => false);
}

// Спрашивали ли уже разрешение на push автоматически (после первого входа в приложение)
export function pushAskedBefore() {
  try {
    return localStorage.getItem(ASKED) === "1";
  } catch {
    return true;
  }
}

function markAsked() {
  try {
    localStorage.setItem(ASKED, "1");
  } catch {}
}

// Push в мобильном приложении: разрешение → токен FCM/APNs → сервер.
// prompt=false — только обновить токен, если разрешение уже дано (без окна с вопросом).
// Возвращает текст ошибки или null.
export async function registerNativePush(config: NativePushConfig, prompt: boolean): Promise<string | null> {
  const platform = nativePlatform();
  if (!platform) return "Браузер не поддерживает push";
  // Без ключей на сервере (и google-services.json в сборке Android) регистрация бесполезна
  if (!config[platform]) return "Push не настроен на сервере";
  if (!(await firebaseInBuild(platform))) return "Приложение собрано без Firebase (google-services.json), push недоступен";
  const { PushNotifications } = await import("@capacitor/push-notifications");
  if (platform === "android") {
    // Свой канал с высокой важностью: уведомление о заказе всплывает поверх экрана и звучит.
    // Название канала видно в настройках уведомлений Android.
    await PushNotifications.createChannel({ id: "orders", name: "Заказы и уведомления", importance: 5, visibility: 1, vibration: true }).catch(() => null);
  }
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive !== "granted" && perm.receive !== "denied") {
    if (!prompt) return null;
    markAsked();
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

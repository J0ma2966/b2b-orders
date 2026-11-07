"use client";

import { Capacitor } from "@capacitor/core";

export type Position = { lat: number; lng: number };

// Текст ошибки — ключ словаря (переводится там, где показывается)
export class LocationError extends Error {}

const DENIED = "Нет доступа к местоположению. Разрешите его приложению в настройках телефона.";
const FAILED = "Не удалось определить местоположение. Отметьте точку на карте вручную.";

// Текущее местоположение. В приложении — нативно через @capacitor/geolocation: системный запрос
// разрешения и работа без HTTPS (встроенный браузер не даёт геолокацию сайту по http, например при
// проверке по Wi‑Fi). В браузере — navigator.geolocation (только HTTPS или localhost).
export async function currentPosition(): Promise<Position> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Geolocation")) return nativePosition();
  return browserPosition();
}

async function nativePosition(): Promise<Position> {
  const { Geolocation } = await import("@capacitor/geolocation");
  let perm = await Geolocation.checkPermissions().catch(() => null);
  if (perm?.location !== "granted" && perm?.coarseLocation !== "granted") {
    perm = await Geolocation.requestPermissions({ permissions: ["location", "coarseLocation"] }).catch(() => null);
  }
  if (perm && perm.location !== "granted" && perm.coarseLocation !== "granted") throw new LocationError(DENIED);
  try {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (e) {
    // Геолокация выключена в шторке телефона
    if (/disabled|not enabled|services/i.test(String((e as Error)?.message))) {
      throw new LocationError("Включите определение местоположения (GPS) на телефоне и попробуйте ещё раз.");
    }
    throw new LocationError(FAILED);
  }
}

function browserPosition(): Promise<Position> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return Promise.reject(new LocationError("Определение местоположения работает только по HTTPS. Отметьте точку на карте вручную."));
  }
  if (!navigator.geolocation) return Promise.reject(new LocationError("Браузер не поддерживает определение местоположения"));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new LocationError(err.code === err.PERMISSION_DENIED ? "Нет доступа к местоположению. Разрешите его сайту в настройках браузера." : FAILED)),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}

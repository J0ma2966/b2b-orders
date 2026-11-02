"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

// Страница открыта в мобильном приложении (Android, iOS), а не в браузере
export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): "android" | "ios" | null {
  const p = Capacitor.getPlatform();
  return p === "android" || p === "ios" ? p : null;
}

// Свой плагин приложения: системная печать страницы (mobile/*/PrintPlugin)
export const Printer = registerPlugin<{ printPage(options: { title?: string }): Promise<void> }>("Printer");

export function printPage() {
  if (isNativeApp()) return Printer.printPage({ title: document.title }).catch(() => window.print());
  window.print();
}

// Имя файла из Content-Disposition (filename*=UTF-8''… важнее filename="…")
export function fileNameFrom(disposition: string | null, fallback: string) {
  if (!disposition) return fallback;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition);
  if (star) {
    try {
      return sanitizeFileName(decodeURIComponent(star[1].trim()), fallback);
    } catch {}
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
  return sanitizeFileName(plain?.[1].trim() ?? fallback, fallback);
}

function sanitizeFileName(name: string, fallback: string) {
  const clean = name.replace(/[/\\\0]/g, "_").replace(/^\.+/, "").slice(0, 120);
  return clean || fallback;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Выгрузка (Excel и т. п.) в приложении: файл сохраняется во временную папку и открывается меню «Поделиться»
export async function shareDownload(href: string) {
  const res = await fetch(href, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const name = fileNameFrom(res.headers.get("content-disposition"), "file");
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
  const { uri } = await Filesystem.writeFile({ path: name, data: await blobToBase64(await res.blob()), directory: Directory.Cache });
  await Share.share({ title: name, files: [uri] });
}

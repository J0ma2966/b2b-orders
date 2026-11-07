"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Capacitor } from "@capacitor/core";
import { useT } from "@/lib/i18n/client";
import { isNativeApp } from "@/lib/native";

const MANUAL = "Камера недоступна. Введите код, который магазин видит под QR.";
const NATIVE_DENIED = "Нет доступа к камере. Разрешите камеру приложению в настройках телефона или введите код, который магазин видит под QR.";
const BROWSER_DENIED = "Нет доступа к камере. Разрешите камеру сайту в настройках браузера или введите код, который магазин видит под QR.";
const ONLY_HTTPS = "Камера в браузере работает только по HTTPS. Введите код, который магазин видит под QR.";
const UPDATE_APP = "Чтобы сканировать QR, обновите приложение. Пока введите код, который магазин видит под QR.";

// Сканер QR камерой телефона. Если камера недоступна — код вводится вручную.
// В приложении — нативный сканер (@capacitor/barcode-scanner): сам спрашивает разрешение на камеру
// и работает без HTTPS. Встроенный браузер Android не даёт камеру сайту по http (проверка по Wi‑Fi).
// В браузере — getUserMedia + jsQR.
export function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const native = isNativeApp() && Capacitor.isPluginAvailable("CapacitorBarcodeScanner");
  return native ? <NativeScanner onScan={onScan} onClose={onClose} /> : <BrowserScanner onScan={onScan} onClose={onClose} />;
}

function vibrate() {
  import("@capacitor/haptics").then(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success })).catch(() => null);
}

type Props = { onScan: (text: string) => void; onClose: () => void };
type NativeResult = { text: string } | { cancelled: true } | { error: string };

// Один запуск на открытие: повторный эффект (StrictMode, возврат на страницу) ждёт тот же экран сканера
let inFlight: Promise<NativeResult> | null = null;

async function scanNative(t: ReturnType<typeof useT>): Promise<NativeResult> {
  try {
    const m = await import("@capacitor/barcode-scanner");
    const r = await m.CapacitorBarcodeScanner.scanBarcode({
      hint: m.CapacitorBarcodeScannerTypeHint.QR_CODE,
      scanInstructions: t("Наведите камеру на QR-код на телефоне магазина"),
      scanButton: false,
      cameraDirection: m.CapacitorBarcodeScannerCameraDirection.BACK,
      cancelButtonAccessibilityLabel: t("Закрыть камеру"),
      android: { scanningLibrary: m.CapacitorBarcodeScannerAndroidScanningLibrary.MLKIT },
    });
    return r.ScanResult ? { text: r.ScanResult } : { cancelled: true };
  } catch (e) {
    // Коды ошибок сканера: OS-PLUG-BARC-0006 — закрыли, 0007 — нет разрешения на камеру
    const { code, message } = (e ?? {}) as { code?: string; message?: string };
    if (code?.endsWith("0006") || /cancel/i.test(message ?? "")) return { cancelled: true };
    if (code?.endsWith("0007") || /permission|camera access/i.test(message ?? "")) return { error: NATIVE_DENIED };
    return { error: MANUAL };
  }
}

function NativeScanner({ onScan, onClose }: Props) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ onScan, onClose, t });
  useEffect(() => {
    latest.current = { onScan, onClose, t };
  });

  useEffect(() => {
    let active = true;
    inFlight ??= scanNative(latest.current.t).finally(() => {
      inFlight = null;
    });
    inFlight.then((r) => {
      if (!active) return;
      if ("text" in r) {
        vibrate();
        latest.current.onScan(r.text);
      } else if ("cancelled" in r) latest.current.onClose();
      else setError(r.error);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-2">
      <p className={error ? "text-sm text-red-600" : "text-sm text-gray-500"}>{t(error ?? "Открываю камеру…")}</p>
      <button type="button" className="text-sm text-gray-600 underline" onClick={onClose}>{t("Закрыть камеру")}</button>
    </div>
  );
}

function BrowserScanner({ onScan, onClose }: Props) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    (async () => {
      // По http (не localhost) браузер не даёт камеру вовсе: navigator.mediaDevices нет
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(isNativeApp() ? UPDATE_APP : window.isSecureContext ? MANUAL : ONLY_HTTPS);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = () => {
          const v = video.current;
          const c = canvas.current;
          if (stopped || !v || !c) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const g = c.getContext("2d", { willReadFrequently: true })!;
            g.drawImage(v, 0, 0, c.width, c.height);
            const img = g.getImageData(0, 0, c.width, c.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (code?.data) {
              // В приложении — короткая вибрация: код считан, можно убирать телефон
              if (isNativeApp()) vibrate();
              onScan(code.data);
              return;
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (e) {
        if (!stopped) setError((e as Error)?.name === "NotAllowedError" ? (isNativeApp() ? NATIVE_DENIED : BROWSER_DENIED) : MANUAL);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan]);

  return (
    <div className="space-y-2">
      {error ? (
        <p className="text-sm text-red-600">{t(error)}</p>
      ) : (
        <video ref={video} className="aspect-square w-full rounded-lg bg-black object-cover" muted playsInline />
      )}
      <canvas ref={canvas} className="hidden" />
      <button type="button" className="text-sm text-gray-600 underline" onClick={onClose}>{t("Закрыть камеру")}</button>
    </div>
  );
}

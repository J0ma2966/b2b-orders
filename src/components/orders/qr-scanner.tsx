"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useT } from "@/lib/i18n/client";

// Сканер QR камерой телефона. Если камера недоступна — код вводится вручную.
export function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    (async () => {
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
              onScan(code.data);
              return;
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch {
        setError("Камера недоступна. Введите код, который магазин видит под QR.");
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

"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { LatLng } from "./map-picker-inner";

const Inner = dynamic(() => import("./map-picker-inner"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-gray-100 sm:h-80" />,
});

// Ташкент по умолчанию
const DEFAULT_CENTER = { lat: 41.3111, lng: 69.2797 };

// Выбор координат на карте с автоопределением местоположения (ТЗ п. 11).
export function MapPicker({
  latName = "lat",
  lngName = "lng",
  defaultValue,
  error,
}: {
  latName?: string;
  lngName?: string;
  defaultValue?: LatLng | null;
  error?: string;
}) {
  const [point, setPoint] = useState<LatLng | null>(defaultValue ?? null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  function locate() {
    if (!navigator.geolocation) return setGeoError("Браузер не поддерживает определение местоположения");
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setGeoError("Не удалось определить местоположение. Отметьте точку на карте вручную.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={locate} disabled={locating}>
          {locating ? "Определяем…" : "📍 Моё местоположение"}
        </Button>
        <span className="text-xs text-gray-500">или нажмите на карту в нужном месте</span>
      </div>
      <Inner value={point} onChange={setPoint} center={point ?? DEFAULT_CENTER} />
      <input type="hidden" name={latName} value={point?.lat ?? ""} />
      <input type="hidden" name={lngName} value={point?.lng ?? ""} />
      <div className="text-xs text-gray-500">
        {point ? `Координаты: ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : "Точка не выбрана"}
      </div>
      {(geoError || error) && <div className="text-xs text-red-600">{geoError ?? error}</div>}
    </div>
  );
}

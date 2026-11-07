"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/client";
import { createMap, TASHKENT } from "./leaflet-base";
import type { MapPoint } from "./points-map";

type Translate = (text: string) => string;

// Подпись точки собирается из DOM-узлов (не строкой HTML): названия вводят пользователи
function popup(p: MapPoint, t: Translate) {
  const box = document.createElement("div");
  box.className = "text-sm";
  const title = document.createElement("div");
  title.className = "font-medium";
  title.textContent = t(p.label);
  box.append(title);
  if (p.note) {
    const note = document.createElement("div");
    note.className = "text-gray-600";
    note.textContent = t(p.note);
    box.append(note);
  }
  if (p.href) {
    const link = document.createElement("a");
    link.href = p.href;
    link.textContent = t("Открыть →");
    box.append(link);
  }
  return box;
}

export default function PointsMapInner({ points }: { points: MapPoint[] }) {
  const t = useT();
  const node = useRef<HTMLDivElement>(null);
  const latest = useRef<{ points: MapPoint[]; t: Translate }>({ points, t });
  useEffect(() => {
    latest.current = { points, t };
  });

  // Карта и точки создаются заново при каждом показе страницы (см. leaflet-base.ts)
  useEffect(() => {
    const m = createMap(node.current!, TASHKENT, 11);
    const { points: list, t: tr } = latest.current;
    for (const p of list) {
      L.circleMarker([p.lat, p.lng], { radius: p.size ?? 8, color: p.color, fillColor: p.color, fillOpacity: 0.8 })
        .bindPopup(() => popup(p, tr))
        .addTo(m);
    }
    if (list.length === 1) m.setView([list[0].lat, list[0].lng], 14);
    if (list.length > 1) m.fitBounds(list.map((p) => [p.lat, p.lng] as L.LatLngTuple), { padding: [30, 30], maxZoom: 15 });
    return () => {
      m.remove();
    };
  }, [points]);

  return <div ref={node} className="h-[60vh] min-h-80 w-full rounded-xl ring-1 ring-gray-300" />;
}

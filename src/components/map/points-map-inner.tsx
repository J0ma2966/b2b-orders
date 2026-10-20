"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import { useT } from "@/lib/i18n/client";
import type { MapPoint } from "./points-map";

function Fit({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 14);
    if (points.length > 1) map.fitBounds(points.map((p) => [p.lat, p.lng] as [number, number]), { padding: [30, 30], maxZoom: 15 });
  }, [map, points]);
  return null;
}

export default function PointsMapInner({ points }: { points: MapPoint[] }) {
  const t = useT();
  return (
    <MapContainer center={[41.3111, 69.2797]} zoom={11} className="h-[60vh] min-h-80 w-full rounded-xl ring-1 ring-gray-300" scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Fit points={points} />
      {points.map((p, i) => (
        <CircleMarker key={i} center={[p.lat, p.lng]} radius={p.size ?? 8} pathOptions={{ color: p.color, fillColor: p.color, fillOpacity: 0.8 }}>
          <Popup>
            <div className="text-sm">
              <div className="font-medium">{t(p.label)}</div>
              {p.note && <div className="text-gray-600">{t(p.note)}</div>}
              {p.href && <a href={p.href}>{t("Открыть →")}</a>}

            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

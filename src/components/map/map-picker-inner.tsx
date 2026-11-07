"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { createMap } from "./leaflet-base";

export type LatLng = { lat: number; lng: number };

export default function MapPickerInner({
  value,
  onChange,
  center,
}: {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  center: LatLng;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const latest = useRef({ value, onChange, center });
  useEffect(() => {
    latest.current = { value, onChange, center };
  });

  // Карта живёт, пока страница видна (см. leaflet-base.ts)
  useEffect(() => {
    const { value: v, center: c } = latest.current;
    const m = createMap(node.current!, v ? [v.lat, v.lng] : [c.lat, c.lng], v ? 15 : 11);
    m.on("click", (e: L.LeafletMouseEvent) => latest.current.onChange({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    return () => {
      map.current = null;
      m.remove();
    };
  }, []);

  // Выбранная точка: метка и перелёт к ней
  useEffect(() => {
    const m = map.current;
    if (!m || !value) return;
    const marker = L.circleMarker([value.lat, value.lng], { radius: 10, color: "#1f5ad6", fillOpacity: 0.6 }).addTo(m);
    m.flyTo([value.lat, value.lng], Math.max(m.getZoom(), 15), { duration: 0.5 });
    return () => {
      marker.remove();
    };
  }, [value]);

  return <div ref={node} className="h-64 w-full rounded-lg ring-1 ring-gray-300 sm:h-80" />;
}

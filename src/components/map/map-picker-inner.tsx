"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { useEffect } from "react";

export type LatLng = { lat: number; lng: number };

function ClickHandler({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FlyTo({ point }: { point: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 15), { duration: 0.5 });
  }, [map, point]);
  return null;
}

export default function MapPickerInner({
  value,
  onChange,
  center,
}: {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  center: LatLng;
}) {
  return (
    <MapContainer
      center={value ?? center}
      zoom={value ? 15 : 11}
      className="h-64 w-full rounded-lg ring-1 ring-gray-300 sm:h-80"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={onChange} />
      <FlyTo point={value} />
      {value && <CircleMarker center={[value.lat, value.lng]} radius={10} pathOptions={{ color: "#1f5ad6", fillOpacity: 0.6 }} />}
    </MapContainer>
  );
}

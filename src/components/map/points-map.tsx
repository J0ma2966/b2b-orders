"use client";

import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n/client";

export type MapPoint = { lat: number; lng: number; label: string; note?: string; href?: string; color: string; size?: number };

const Inner = dynamic(() => import("./points-map-inner"), {
  ssr: false,
  loading: () => <div className="h-[60vh] min-h-80 w-full animate-pulse rounded-xl bg-gray-100" />,
});

// Карта точек (ТЗ п. 71): магазины, офисы, точки доставки
export function PointsMap({ points, legend }: { points: MapPoint[]; legend: { color: string; label: string }[] }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-sm">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1"><span className="inline-block size-3 rounded-full" style={{ background: l.color }} />{t(l.label)}</span>

        ))}
      </div>
      <Inner points={points} />
    </div>
  );
}

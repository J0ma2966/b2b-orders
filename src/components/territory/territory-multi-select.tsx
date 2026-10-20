"use client";

import { useState } from "react";
import type { TerritoryOption } from "./types";

// Территория доставки поставщика: целые регионы или отдельные города/районы (ТЗ п. 10).
export function TerritoryMultiSelect({
  territories,
  name = "territoryIds[]",
  defaultValue = [],
}: {
  territories: TerritoryOption[];
  name?: string;
  defaultValue?: string[];
}) {
  const [selected, setSelected] = useState(new Set(defaultValue));
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(territories.filter((t) => t.type !== "REGION" && selected.has(t.id)).map((t) => t.parentId!)),
  );
  const regions = territories.filter((t) => t.type === "REGION");

  function toggle(id: string, childIds: string[] = []) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        // Регион целиком покрывает города, отдельная отметка не нужна
        childIds.forEach((c) => next.delete(c));
      }
      return next;
    });
  }

  return (
    <div className="max-h-96 divide-y divide-gray-100 overflow-y-auto rounded-lg ring-1 ring-gray-300">
      {regions.map((r) => {
        const children = territories.filter((t) => t.parentId === r.id);
        const regionOn = selected.has(r.id);
        const partial = children.filter((c) => selected.has(c.id)).length;
        return (
          <div key={r.id} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={regionOn}
                onChange={() => toggle(r.id, children.map((c) => c.id))}
                id={`t-${r.id}`}
              />
              <label htmlFor={`t-${r.id}`} className="flex-1 text-sm font-medium">
                {r.name} {regionOn && <span className="text-xs font-normal text-gray-500">(весь регион)</span>}
                {!regionOn && partial > 0 && <span className="text-xs font-normal text-gray-500">(выбрано: {partial})</span>}
              </label>
              {children.length > 0 && !regionOn && (
                <button
                  type="button"
                  className="text-xs text-brand-600"
                  onClick={() =>
                    setOpen((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    })
                  }
                >
                  {open.has(r.id) ? "Скрыть" : "Города и районы"}
                </button>
              )}
            </div>
            {open.has(r.id) && !regionOn && (
              <div className="mt-2 grid gap-1 pl-6 sm:grid-cols-2">
                {children.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}

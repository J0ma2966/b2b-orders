"use client";

import { useMemo, useState } from "react";
import { Field, Select } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import type { TerritoryOption } from "./types";

// Выбор региона, затем города или района. Отправляет самую точную территорию.
export function TerritorySelect({
  territories,
  name = "territoryId",
  defaultValue,
  error,
}: {
  territories: TerritoryOption[];
  name?: string;
  defaultValue?: string;
  error?: string[] | string;
}) {
  const t = useT();
  const byId = useMemo(() => new Map(territories.map((t) => [t.id, t])), [territories]);
  const regions = territories.filter((t) => t.type === "REGION");
  const initial = defaultValue ? byId.get(defaultValue) : undefined;
  const initialRegion = initial?.type === "REGION" ? initial.id : initial?.parentId ?? "";
  const [regionId, setRegionId] = useState(initialRegion);
  const [localId, setLocalId] = useState(initial && initial.type !== "REGION" ? initial.id : "");
  const locals = territories.filter((t) => t.parentId === regionId);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Регион" error={error}>
        <Select
          value={regionId}
          onChange={(e) => {
            setRegionId(e.target.value);
            setLocalId("");
          }}
          required
        >
          <option value="">{t("Выберите регион")}</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {t(r.name)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Город или район">
        <Select value={localId} onChange={(e) => setLocalId(e.target.value)} disabled={locals.length === 0} required={locals.length > 0}>
          <option value="">{locals.length ? t("Выберите") : "—"}</option>
          {locals.map((c) => (
            <option key={c.id} value={c.id}>
              {t(c.name)}

            </option>
          ))}
        </Select>
      </Field>
      <input type="hidden" name={name} value={localId || regionId} />
    </div>
  );
}

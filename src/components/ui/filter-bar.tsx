"use client";

import { Button, Input, Select } from "./index";
import { useT } from "@/lib/i18n/client";

// Поиск и фильтр списков через GET-параметры (ТЗ п. 79)
export function FilterBar({
  q,
  status,
  statuses,
  placeholder = "Поиск",
  allLabel = "Все статусы",
  search = true,
  hidden,
}: {
  q?: string;
  status?: string;
  statuses?: [string, string][];
  placeholder?: string;
  allLabel?: string;
  search?: boolean;
  // Другие параметры адреса, которые поиск не должен сбрасывать
  hidden?: Record<string, string | undefined>;
}) {
  const t = useT();
  return (
    <form className="mb-4 flex flex-wrap gap-2">
      {hidden && Object.entries(hidden).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      {search && (
        <div className="w-full max-w-xs flex-1">
          <Input name="q" defaultValue={q} placeholder={t(placeholder)} aria-label={t(placeholder)} />
        </div>
      )}
      {statuses && (
        <div className="w-full sm:w-56">
        <Select name="status" defaultValue={status ?? ""}>
          <option value="">{t(allLabel)}</option>
          {statuses.map(([v, l]) => (
            <option key={v} value={v}>
              {t(l)}
            </option>
          ))}
        </Select>
        </div>
      )}
      <Button type="submit" variant="secondary">Найти</Button>
    </form>
  );
}

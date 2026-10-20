import { Button, Input, Select } from "./index";

// Поиск и фильтр списков через GET-параметры (ТЗ п. 79)
export function FilterBar({
  q,
  status,
  statuses,
  placeholder = "Поиск",
  allLabel = "Все статусы",
}: {
  q?: string;
  status?: string;
  statuses?: [string, string][];
  placeholder?: string;
  allLabel?: string;
}) {
  return (
    <form className="mb-4 flex flex-wrap gap-2">
      <div className="w-full max-w-xs flex-1">
        <Input name="q" defaultValue={q} placeholder={placeholder} />
      </div>
      {statuses && (
        <div className="w-full sm:w-56">
        <Select name="status" defaultValue={status ?? ""}>
          <option value="">{allLabel}</option>
          {statuses.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        </div>
      )}
      <Button type="submit" variant="secondary">Найти</Button>
    </form>
  );
}

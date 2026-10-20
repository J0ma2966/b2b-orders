"use client";

import { useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { UNIT_KINDS, UNIT_LABEL } from "@/lib/catalog";

// Новые единицы продажи: единица, цена, начальный остаток (ТЗ п. 15, 18)
export function UnitRows({ initial = 1 }: { initial?: number }) {
  const [rows, setRows] = useState(() => Array.from({ length: initial }, (_, i) => i));
  const [kinds, setKinds] = useState<Record<number, string>>({});
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs text-gray-500 sm:grid">
        <span>Единица</span>
        <span>Цена, сум</span>
        <span>Начальный остаток</span>
        <span className="w-8" />
      </div>
      {rows.map((key, i) => (
        <div key={key} className="grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:bg-transparent sm:p-0">
          <div className="col-span-2 flex gap-2 sm:col-span-1">
            <Select name="unitKind" aria-label="Единица" defaultValue={i === 0 ? "PIECE" : "BOX"} onChange={(e) => setKinds({ ...kinds, [key]: e.target.value })}>
              {UNIT_KINDS.map((k) => (
                <option key={k} value={k}>{UNIT_LABEL[k]}</option>
              ))}
            </Select>
            <Input
              name="unitName"
              aria-label="Название единицы"
              placeholder="Название"
              className={kinds[key] === "OTHER" ? "" : "hidden"}
            />
          </div>
          <Input name="unitPrice" aria-label="Цена" inputMode="decimal" placeholder="Цена" />
          <Input name="unitQty" aria-label="Начальный остаток" inputMode="decimal" placeholder="Остаток" />
          <button
            type="button"
            className="col-span-2 text-xs text-gray-500 hover:text-red-600 sm:col-span-1 sm:w-8"
            onClick={() => setRows(rows.filter((r) => r !== key))}
            aria-label="Убрать единицу"
          >
            ✕
          </button>
        </div>
      ))}
      <Button type="button" variant="ghost" onClick={() => setRows([...rows, Math.max(-1, ...rows) + 1])}>
        + Единица
      </Button>
      <p className="text-xs text-gray-500">Без цены заказ в этой единице невозможен. Остаток каждой единицы ведётся отдельно.</p>
    </div>
  );
}

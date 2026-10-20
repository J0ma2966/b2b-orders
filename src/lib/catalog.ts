// Справочники и разбор полей каталога (без зависимостей, покрыто тестами).
import type { UnitKind } from "@/generated/prisma/enums";

export const UNIT_LABEL: Record<UnitKind, string> = {
  PIECE: "шт.",
  BOX: "коробка",
  BLOCK: "блок",
  KG: "кг",
  PACK: "упаковка",
  LITER: "л",
  OTHER: "другая",
};

export const UNIT_KINDS = Object.keys(UNIT_LABEL) as UnitKind[];

export function unitName(u: { kind: UnitKind; customName: string }) {
  return u.kind === "OTHER" && u.customName ? u.customName : UNIT_LABEL[u.kind];
}

// "12 500", "12500,50", "12 500.5" → 12500.5; пусто → null; ошибка → NaN
export function parseAmount(input: string | null | undefined): number | null {
  const s = (input ?? "").replace(/[\s ]/g, "").replace(",", ".");
  if (!s) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

export function parseSignedAmount(input: string | null | undefined): number | null {
  const s = (input ?? "").replace(/[\s ]/g, "").replace(",", ".");
  if (!s) return null;
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

// Характеристики из текста "Название: значение" построчно
export function parseAttributes(text: string | null | undefined) {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(":");
      return i > 0 ? { name: line.slice(0, i).trim(), value: line.slice(i + 1).trim() } : { name: line, value: "" };
    });
}

export function attributesToText(attrs: unknown) {
  if (!Array.isArray(attrs)) return "";
  return attrs
    .map((a: { name?: string; value?: string }) => (a.value ? `${a.name}: ${a.value}` : a.name ?? ""))
    .join("\n");
}

export function formatQty(v: number | string | { toString(): string }) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(Number(v.toString()));
}

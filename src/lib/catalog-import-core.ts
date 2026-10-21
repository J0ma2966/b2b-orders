// П7: разбор таблицы загрузки каталога (без БД, покрыто тестами).
import type { UnitKind } from "@/generated/prisma/enums";
import { parseAmount } from "./catalog";

export const IMPORT_COLUMNS = ["Артикул", "Название", "Категория", "Единица", "Цена", "Приход", "Бренд", "Описание"] as const;
type Column = "sku" | "name" | "category" | "unit" | "price" | "income" | "brand" | "description";

// Заголовки по-русски и по-узбекски, в любом порядке и регистре
const HEADER_ALIASES: Record<Column, string[]> = {
  sku: ["артикул", "artikul", "sku", "код"],
  name: ["название", "наименование", "товар", "nomi", "mahsulot", "tovar", "name"],
  category: ["категория", "toifa", "kategoriya", "category"],
  unit: ["единица", "ед", "ед. изм", "birlik", "unit"],
  price: ["цена", "narx", "narxi", "price"],
  income: ["приход", "поступление", "кол-во", "количество", "kirim", "miqdor", "qty"],
  brand: ["бренд", "brend", "brand"],
  description: ["описание", "tavsif", "description"],
};

const UNIT_ALIASES: [UnitKind, string[]][] = [
  ["PIECE", ["шт", "штука", "штук", "штуки", "dona", "pcs", "pc", "piece"]],
  ["BOX", ["коробка", "кор", "короб", "quti", "box"]],
  ["BLOCK", ["блок", "blok", "block"]],
  ["KG", ["кг", "килограмм", "kg"]],
  ["PACK", ["упаковка", "уп", "упак", "qadoq", "pack"]],
  ["LITER", ["л", "литр", "litr", "l", "liter"]],
];

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const key = (v: unknown) => norm(v).toLowerCase().replace(/\.$/, "");

export function parseUnitLabel(v: unknown): { kind: UnitKind; customName: string } {
  const k = key(v);
  if (!k) return { kind: "PIECE", customName: "" };
  for (const [kind, names] of UNIT_ALIASES) if (names.includes(k)) return { kind, customName: "" };
  return { kind: "OTHER", customName: norm(v).slice(0, 40) };
}

export type ImportRow = {
  line: number; // номер строки в файле, для сообщений
  sku: string | null;
  name: string;
  category: string | null;
  unit: { kind: UnitKind; customName: string };
  price: number | null; // null — цену не менять (у новой единицы — без цены)
  income: number | null;
  brand: string | null;
  description: string | null;
};

const MAX_ROWS = 5000;

function amount(v: unknown): number | null {
  if (v === null || v === undefined || norm(v) === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  // «12 500 сум», «12500 soʻm» — валюту отбрасываем
  return parseAmount(String(v).replace(/\s*(сум|so[ʻʼ'‘’]?m|uzs)\.?$/i, ""));
}

export function parseImportTable(table: (string | number | null)[][]): { rows: ImportRow[]; errors: string[] } {
  const errors: string[] = [];
  const headerAt = table.findIndex((r) => r.some((c) => norm(c)));
  if (headerAt < 0) return { rows: [], errors: ["Таблица пустая"] };
  const header = table[headerAt].map(key);
  const col = {} as Record<Column, number>;
  for (const c of Object.keys(HEADER_ALIASES) as Column[]) col[c] = header.findIndex((h) => HEADER_ALIASES[c].includes(h));
  if (col.name < 0) return { rows: [], errors: ["Нет столбца «Название». Скачайте шаблон и заполните его"] };
  const cell = (r: (string | number | null)[], c: Column) => (col[c] >= 0 ? r[col[c]] : null);
  const rows: ImportRow[] = [];
  const seen = new Map<string, number>();
  for (let i = headerAt + 1; i < table.length; i++) {
    const r = table[i] ?? [];
    if (!r.some((c) => norm(c))) continue;
    const line = i + 1;
    if (rows.length >= MAX_ROWS) {
      errors.push(`Больше ${MAX_ROWS} строк — загрузите файл частями`);
      break;
    }
    const name = norm(cell(r, "name")).slice(0, 200);
    if (!name) {
      errors.push(`Строка ${line}: не указано название`);
      continue;
    }
    const price = amount(cell(r, "price"));
    if (Number.isNaN(price) || (price !== null && price <= 0)) {
      errors.push(`Строка ${line}: цена — число больше нуля`);
      continue;
    }
    const income = amount(cell(r, "income"));
    if (Number.isNaN(income) || (income !== null && income < 0)) {
      errors.push(`Строка ${line}: приход — число не меньше нуля`);
      continue;
    }
    const sku = norm(cell(r, "sku")).slice(0, 64) || null;
    const unit = parseUnitLabel(cell(r, "unit"));
    const dup = `${sku ?? name.toLowerCase()}|${unit.kind}|${unit.customName.toLowerCase()}`;
    if (seen.has(dup)) {
      errors.push(`Строка ${line}: повтор строки ${seen.get(dup)}`);
      continue;
    }
    seen.set(dup, line);
    rows.push({
      line,
      sku,
      name,
      category: norm(cell(r, "category")).slice(0, 100) || null,
      unit,
      price,
      income: income || null,
      brand: norm(cell(r, "brand")).slice(0, 100) || null,
      description: norm(cell(r, "description")).slice(0, 2000) || null,
    });
  }
  return { rows, errors };
}

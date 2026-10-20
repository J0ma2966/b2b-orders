// Перевод интерфейса (русский — исходный язык, узбекский — латиница). Без зависимостей от сервера.
// Ключ словаря — сама русская строка. Строки с подстановкой записываются шаблоном «Заказ №{n}»:
// такой шаблон переводит и готовую строку «Заказ №1003» (она распознаётся по шаблону), поэтому
// сообщения из бизнес-логики, уведомления и записи журналов переводятся при показе.
import uz from "./uz";

export type Locale = "ru" | "uz";
export const LOCALES: Locale[] = ["ru", "uz"];
export const LOCALE_COOKIE = "lang";
export const LOCALE_NAME: Record<Locale, string> = { ru: "Русский", uz: "Oʻzbekcha" };

export function parseLocale(v: string | null | undefined): Locale | null {
  return v === "ru" || v === "uz" ? v : null;
}

type Num = number | string | { toString(): string } | null | undefined;
export type ParamValue = string | number | null | undefined;
export type Params = Record<string, ParamValue>;

export type T = {
  (text: string | null | undefined, params?: Params): string;
  locale: Locale;
  money(v: Num): string;
  date(d: Date | string | null | undefined): string;
  dateTime(d: Date | string | null | undefined): string;
  // Русское склонение после числа; в узбекском существительное после числа не меняется
  plural(n: number, one: string, few: string, many: string): string;
};

const TZ = "Asia/Tashkent";
const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: TZ });
const dateFmt: Record<Locale, Intl.DateTimeFormat> = {
  ru: new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: TZ }),
  uz: new Intl.DateTimeFormat("uz-Latn-UZ", { dateStyle: "medium", timeZone: TZ }),
};
const numberFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const CURRENCY: Record<Locale, string> = { ru: "сум", uz: "soʻm" };

export function formatMoneyIn(locale: Locale, v: Num) {
  if (v === null || v === undefined) return "—";
  return `${numberFmt.format(Number(v.toString()))} ${CURRENCY[locale]}`;
}
export function formatDateIn(locale: Locale, d: Date | string | null | undefined) {
  return d ? dateFmt[locale].format(new Date(d)) : "—";
}
export function formatDateTimeIn(d: Date | string | null | undefined) {
  return d ? dateTimeFmt.format(new Date(d)) : "—";
}

export function interpolate(template: string, params?: Params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k] ?? "") : m));
}

type Template = { re: RegExp; names: string[]; target: string; weight: number };
type Dict = { exact: Map<string, string>; templates: Template[]; memo: Map<string, string> };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(dict: Record<string, string>): Dict {
  const exact = new Map<string, string>();
  const templates: Template[] = [];
  for (const [src, target] of Object.entries(dict)) {
    exact.set(src, target);
    if (!/\{\w+\}/.test(src)) continue;
    const names: string[] = [];
    const parts = src.split(/(\{\w+\})/);
    const literal = parts.filter((p) => !/^\{\w+\}$/.test(p)).join("");
    // Шаблон без собственного текста совпал бы с чем угодно
    if (literal.replace(/[^А-Яа-яЁё]/g, "").length < 2) continue;
    const re = parts
      .map((p) => {
        const m = /^\{(\w+)\}$/.exec(p);
        if (!m) return escapeRe(p);
        names.push(m[1]);
        return "(.+?)";
      })
      .join("");
    templates.push({ re: new RegExp(`^${re}$`, "s"), names, target, weight: literal.length });
  }
  // Сначала самые конкретные шаблоны
  templates.sort((a, b) => b.weight - a.weight);
  return { exact, templates, memo: new Map() };
}

const MONEY_RU = /^(-?[\d\s  .,]+) сум$/;
const dicts: Partial<Record<Locale, Dict>> = {};
const getDict = (locale: Locale) => (dicts[locale] ??= compile(locale === "uz" ? uz : {}));

function translateText(d: Dict, locale: Locale, text: string, depth = 0): string {
  const hit = d.exact.get(text);
  if (hit !== undefined) return hit;
  if (!/[А-Яа-яЁё]/.test(text)) return text;
  const money = MONEY_RU.exec(text);
  if (money) return `${money[1]} ${CURRENCY[locale]}`;
  if (depth > 3) return text;
  const memo = d.memo.get(text);
  if (memo !== undefined) return memo;
  let out = text;
  for (const tpl of d.templates) {
    const m = tpl.re.exec(text);
    if (!m) continue;
    const params: Params = {};
    tpl.names.forEach((n, i) => (params[n] = translateText(d, locale, m[i + 1], depth + 1)));
    out = interpolate(tpl.target, params);
    break;
  }
  if (out === text && text.includes("\n")) {
    out = text.split("\n").map((line) => translateText(d, locale, line, depth + 1)).join("\n");
  } else if (out === text && text.includes(" · ")) {
    // «Товар · коробка», «Регион · город»: части переводятся по отдельности
    out = text.split(" · ").map((part) => translateText(d, locale, part, depth + 1)).join(" · ");
  } else if (out === text && /^[а-яё]/.test(text)) {
    // Подпись со строчной буквы внутри фразы: «заказ №1: принят поставщиком»
    const cap = d.exact.get(text[0].toUpperCase() + text.slice(1));
    if (cap !== undefined) out = cap[0].toLowerCase() + cap.slice(1);
  }
  if (d.memo.size > 5000) d.memo.clear();
  d.memo.set(text, out);
  return out;
}

export function translate(locale: Locale, text: string | null | undefined, params?: Params): string {
  if (text === null || text === undefined || text === "") return "";
  if (locale === "ru") return interpolate(text, params);
  const d = getDict(locale);
  if (params) {
    const target = d.exact.get(text) ?? text;
    const translated: Params = {};
    for (const [k, v] of Object.entries(params)) translated[k] = typeof v === "string" ? translateText(d, locale, v) : v;
    return interpolate(target, translated);
  }
  return translateText(d, locale, text);
}

function pluralRu(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const instances: Partial<Record<Locale, T>> = {};

export function makeT(locale: Locale): T {
  const existing = instances[locale];
  if (existing) return existing;
  const t = ((text: string | null | undefined, params?: Params) => translate(locale, text, params)) as T;
  t.locale = locale;
  t.money = (v) => formatMoneyIn(locale, v);
  t.date = (d) => formatDateIn(locale, d);
  t.dateTime = (d) => formatDateTimeIn(d);
  t.plural = (n, one, few, many) => (locale === "ru" ? pluralRu(n, one, few, many) : translate(locale, one));
  instances[locale] = t;
  return t;
}

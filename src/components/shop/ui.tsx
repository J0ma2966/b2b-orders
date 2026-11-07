import Link from "next/link";
import type { ReactNode } from "react";
import {
  Apple,
  Baby,
  Beef,
  Candy,
  ChevronLeft,
  Coffee,
  Croissant,
  CupSoda,
  Egg,
  Fish,
  Milk,
  Package,
  Sandwich,
  Snowflake,
  SprayCan,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui";

// Общие детали приложения магазина в стиле макета: инициалы на пастельной плитке, круглая кнопка «Назад»,
// полоска прогресса, значок категории по названию.

const TILES = ["bg-tile-yellow", "bg-tile-blue", "bg-tile-pink", "bg-tile-mint", "bg-tile-violet", "bg-tile-peach"];

// Один и тот же поставщик всегда одного цвета
export function tileColor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILES[h % TILES.length];
}

export const tileByIndex = (i: number) => TILES[i % TILES.length];

// «ООО «Ташкент Опт 851»» → «ТО»
export function initials(name: string) {
  const clean = name
    .replace(/^(ООО|ИП|ЧП|МЧЖ|XK|OOO|AJ|АО)\s+/i, "")
    .replace(/[«»"'“”]/g, "")
    .trim();
  const words = clean.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  if (src) return <img src={src} alt="" className={cn("shrink-0 rounded-2xl object-cover", className)} />;
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-2xl font-display font-bold text-night", tileColor(name), className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

// «842 000 сум» → крупное число и мелкая валюта, без переноса строки
export function Money({ text, className, cur }: { text: string; className?: string; cur?: string }) {
  const m = /^(.*\S)\s(\S+)$/.exec(text);
  return (
    <span className={cn("whitespace-nowrap", className)}>
      {m ? m[1] : text}
      {m && <span className={cn("ml-1 text-[0.55em]", cur)}>{m[2]}</span>}
    </span>
  );
}

export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} transitionTypes={["back"]} aria-label={label} className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-night shadow-sm">
      <ChevronLeft className="size-6" strokeWidth={2.2} aria-hidden />
    </Link>
  );
}

export function Progress({ value, tone = "night", className }: { value: number; tone?: "night" | "coral" | "lime"; className?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className={cn("h-2 overflow-hidden rounded-full", tone === "lime" ? "bg-white/15" : tone === "coral" ? "bg-coral/20" : "bg-black/[0.07]", className)}>
      <div
        className={cn("progress-fill h-full rounded-full", tone === "coral" ? "bg-coral" : tone === "lime" ? "bg-lime" : "bg-night")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Плашка-чип: тёмная или светлая
export function Chip({ dark, children, className }: { dark?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-3.5 py-2 text-sm font-semibold", dark ? "bg-night text-white" : "bg-white/70 text-night", className)}>
      {children}
    </span>
  );
}

// Значок категории по её названию (ru/uz); прочие — коробка
const CATEGORY_ICONS: [RegExp, LucideIcon][] = [
  [/хлеб|выпеч|non|patir|somsa|сомса|самса|лепёш|лепеш/i, Croissant],
  [/напит|вода|сок|ichimlik|suv|газир/i, CupSoda],
  [/молоч|молоко|сыр|sut|pishloq/i, Milk],
  [/слад|конфет|шокол|печен|shirin/i, Candy],
  [/замор|морож|muzlat/i, Snowflake],
  [/бакал|круп|мука|рис|un |guruch|yorma/i, Wheat],
  [/мяс|колбас|go.sht|kolbasa/i, Beef],
  [/рыб|baliq/i, Fish],
  [/яйц|tuxum/i, Egg],
  [/фрукт|овощ|meva|sabzavot/i, Apple],
  [/чай|кофе|choy|qahva/i, Coffee],
  [/быт|хими|мою|чист|gigiyena|maishiy/i, SprayCan],
  [/дет|bolalar/i, Baby],
  [/снек|фаст|tez/i, Sandwich],
];

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Svg = CATEGORY_ICONS.find(([re]) => re.test(name))?.[1] ?? Package;
  return <Svg className={cn("size-7", className)} strokeWidth={1.9} aria-hidden />;
}

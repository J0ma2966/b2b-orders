"use client";

import { useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

const norm = (s: string) => s.toLowerCase().replace(/[«»"'ʻʼ`]/g, "").normalize("NFD").replace(/\u0308/g, "").trim();

// Список поставщиков со строкой поиска по названию и описанию (фильтрует сразу при вводе)
export function SupplierSearchList({ items }: { items: { id: string; text: string; node: ReactNode }[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const needle = norm(q);
  const shown = needle ? items.filter((i) => norm(i.text).includes(needle)) : items;
  return (
    <>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 100))}
          placeholder={t("Поиск поставщика")}
          aria-label={t("Поиск поставщика")}
          enterKeyHint="search"
          autoComplete="off"
          className="block h-12 w-full rounded-2xl border-0 bg-surface pr-11 pl-12 text-base ring-1 ring-black/10 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-500 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label={t("Сбросить")} className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-gray-500 hover:bg-gray-100">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-8 text-center text-sm text-gray-500" role="status">{t("Ничего не найдено")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((i) => (
            <div key={i.id} className="contents">{i.node}</div>
          ))}
        </div>
      )}
    </>
  );
}

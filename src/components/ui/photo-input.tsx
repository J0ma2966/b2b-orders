"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useT } from "@/lib/i18n/client";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

type Item = { file: File; url: string };

// Фото для формы: «Снять фото» открывает камеру (в приложении — с системным запросом разрешения),
// «Из галереи» — готовые снимки. Снимки копятся до max и уходят на сервер одним полем name.
// Встроенный браузер приложения открывает камеру только для accept="image/*" с capture,
// а одно поле <input capture multiple> в браузере телефона даёт сделать лишь один снимок.
export function PhotoInput({
  name,
  label,
  hint,
  error,
  max = 1,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string[] | string;
  max?: number;
}) {
  const t = useT();
  const field = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  // Превью освобождаются при уходе со страницы
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  function put(next: Item[]) {
    const dt = new DataTransfer();
    next.forEach((i) => dt.items.add(i.file));
    if (field.current) field.current.files = dt.files;
    setItems(next);
  }

  // Форму сбросили — список снимков тоже
  useEffect(() => {
    const form = field.current?.form;
    const clear = () => {
      itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url));
      setItems([]);
      setProblem(null);
    };
    form?.addEventListener("reset", clear);
    return () => form?.removeEventListener("reset", clear);
  }, []);

  function add(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    const ok = picked.filter((f) => TYPES.includes(f.type) && f.size <= MAX_BYTES);
    setProblem(
      ok.length === picked.length ? null : t(picked.some((f) => !TYPES.includes(f.type)) ? "Допустимы изображения JPG, PNG или WEBP" : "Файл больше 10 МБ"),
    );
    if (!ok.length) return;
    const added = ok.map((file) => ({ file, url: URL.createObjectURL(file) }));
    const all = max === 1 ? added.slice(-1) : [...items, ...added];
    const kept = all.slice(0, max);
    // Старое фото при замене и то, что не влезло в лимит, — освобождаем
    [...(max === 1 ? items : []), ...all.slice(max)].forEach((i) => URL.revokeObjectURL(i.url));
    if (all.length > max) setProblem(t("Не больше {n} фото", { n: max }));
    put(kept);
  }

  function remove(index: number) {
    URL.revokeObjectURL(items[index].url);
    put(items.filter((_, i) => i !== index));
  }

  const full = max > 1 && items.length >= max;
  const serverError = Array.isArray(error) ? error[0] : error;
  // problem уже переведён, ошибка сервера — ключ словаря
  const message = problem ?? (serverError ? t(serverError) : null);
  const button =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div role="group" aria-labelledby={`${name}-label`}>
      <span id={`${name}-label`} className="mb-1 block text-sm font-medium text-gray-700">{t(label)}</span>
      <input ref={field} type="file" name={name} multiple={max > 1} accept={TYPES.join(",")} className="sr-only" tabIndex={-1} aria-hidden="true" />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={add} />
      <input ref={gallery} type="file" accept={TYPES.join(",")} multiple={max > 1} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={add} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={full} onClick={() => camera.current?.click()}>{t("📷 Снять фото")}</button>
        <button type="button" className={button} disabled={full} onClick={() => gallery.current?.click()}>{t("🖼 Из галереи")}</button>
      </div>
      {items.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map((i, index) => (
            <li key={i.url} className="relative">
              <img src={i.url} alt="" className="size-16 rounded-lg object-cover ring-1 ring-gray-200" />
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={t("Убрать фото")}
                className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-gray-900/80 text-sm leading-none text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {hint && !message && <span className="mt-1 block text-xs text-gray-500">{t(hint)}</span>}
      {message && <span className="mt-1 block text-xs text-red-600" role="alert">{message}</span>}
    </div>
  );
}

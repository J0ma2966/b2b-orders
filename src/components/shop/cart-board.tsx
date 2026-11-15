"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Check, Trash2 } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { CheckoutAllForm, type CheckoutDefaults } from "@/components/orders/shop-forms";
import { Avatar, Money, Progress } from "@/components/shop/ui";
import { removeCartItemsAction } from "@/app/shop/orders/actions";
import { initialFormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";
import { tapHaptic } from "@/lib/native";

export type CartView = {
  supplierId: string;
  name: string;
  logo: string | null;
  // Минимальная сумма заказа поставщика (0 — нет)
  min: number;
  // Ближайшая дата доставки, уже в виде текста
  next: string | null;
  items: { id: string; name: string; qty: string; sum: number }[];
};

const box = "size-5 shrink-0 cursor-pointer rounded accent-brand-600";

// Корзина с галочками: отмеченные товары оформляются одной кнопкой, остальные остаются в корзине.
// «Выбрать все» и «Удалить выбранные» — сверху; сумма и путь до минимальной суммы считаются по отмеченным.
export function CartBoard({ carts, owner, blocked, defaults }: { carts: CartView[]; owner: boolean; blocked: boolean; defaults: CheckoutDefaults }) {
  const t = useT();
  const allIds = useMemo(() => carts.flatMap((c) => c.items.map((i) => i.id)), [carts]);
  // Храним снятые галочки: новый товар в корзине по умолчанию отмечен
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const on = (id: string) => !off.has(id);
  const selected = allIds.filter(on);
  const set = (ids: string[], value: boolean) =>
    setOff((prev) => {
      const next = new Set(prev);
      for (const id of ids) if (value) next.delete(id);
      else next.add(id);
      return next;
    });
  const change = (ids: string[], value: boolean) => {
    tapHaptic();
    setAsking(false);
    setError(null);
    set(ids, value);
  };

  const picked = carts
    .map((c) => {
      const items = c.items.filter((i) => on(i.id));
      return { ...c, picked: items, total: items.reduce((s, i) => s + i.sum, 0) };
    });
  const active = picked.filter((c) => c.picked.length > 0);
  const sum = active.reduce((s, c) => s + c.total, 0);
  const one = active.length === 1 ? active[0] : null;
  const oneHref = one ? `/shop/cart/${one.supplierId}${one.picked.length < one.items.length ? `?items=${one.picked.map((i) => i.id).join(",")}` : ""}` : "";

  function removeSelected() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      for (const id of selected) fd.append("itemIds[]", id);
      const r = await removeCartItemsAction(initialFormState, fd);
      if (r.error) setError(r.error);
      setAsking(false);
    });
  }

  return (
    <>
      <div className="mb-3 flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[1.25rem] bg-surface px-4 py-2" data-testid="cart-toolbar">
        <label className="flex cursor-pointer items-center gap-2.5 py-1 text-[15px] font-semibold">
          <input
            type="checkbox"
            className={box}
            checked={selected.length === allIds.length}
            ref={(el) => {
              if (el) el.indeterminate = selected.length > 0 && selected.length < allIds.length;
            }}
            onChange={(e) => change(allIds, e.target.checked)}
            data-testid="cart-select-all"
          />
          <span>{t("Выбрать все")}</span>
          <span className="font-normal text-gray-500 tabular-nums">{selected.length}/{allIds.length}</span>
        </label>
        {asking ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="font-semibold">{t("Удалить выбранные ({n})?", { n: selected.length })}</span>
            <button type="button" onClick={removeSelected} disabled={pending} className="min-h-9 rounded-full bg-red-600 px-3.5 font-bold text-white disabled:opacity-50" data-testid="cart-delete-yes">
              {pending ? "…" : t("Да")}
            </button>
            <button type="button" onClick={() => setAsking(false)} disabled={pending} className="min-h-9 rounded-full px-3 font-semibold ring-1 ring-black/15">
              {t("Нет")}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAsking(true)}
            disabled={selected.length === 0}
            className="flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-red-700 ring-1 ring-red-200 disabled:opacity-40"
            data-testid="cart-delete"
          >
            <Trash2 className="size-4" aria-hidden />
            {t("Удалить выбранные")}
          </button>
        )}
        {error && <p className="w-full text-sm text-red-600" role="alert">{t(error)}</p>}
      </div>

      <div className="space-y-3 pb-24 md:pb-0">
        {picked.map((c) => {
          const ids = c.items.map((i) => i.id);
          const short = Math.max(0, c.min - c.total);
          return (
            <section key={c.supplierId} className={cn("rounded-[1.75rem] bg-surface p-4", c.picked.length === 0 && "opacity-70")} data-testid="cart-supplier">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className={box}
                  checked={c.picked.length === c.items.length}
                  ref={(el) => {
                    if (el) el.indeterminate = c.picked.length > 0 && c.picked.length < c.items.length;
                  }}
                  onChange={(e) => change(ids, e.target.checked)}
                  aria-label={t("Выбрать все товары: {name}", { name: c.name })}
                />
                <Link href={`/shop/cart/${c.supplierId}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={c.name} src={c.logo} className="size-12 text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg leading-tight font-bold">{c.name}</span>
                    <span className="block truncate text-sm text-gray-500">{c.next ? t("Доставка {date}", { date: c.next }) : t("{n} позиций", { n: c.items.length })}</span>
                  </span>
                  <span className="shrink-0 font-display text-lg font-bold tabular-nums">{t.money(c.total)}</span>
                </Link>
              </div>
              <ul className="mt-3 space-y-0.5 text-[15px]">
                {c.items.map((it) => (
                  <li key={it.id}>
                    <label className={cn("flex min-h-10 cursor-pointer items-center gap-3 py-1", !on(it.id) && "text-gray-400")}>
                      <input type="checkbox" className={box} checked={on(it.id)} onChange={(e) => change([it.id], e.target.checked)} data-testid="cart-item-check" />
                      <span className="min-w-0 flex-1 truncate">
                        {it.name} <span className="text-gray-500">× {it.qty}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">{t.money(it.sum)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {c.min > 0 &&
                c.picked.length > 0 &&
                (short > 0 ? (
                  <div className="mt-3 rounded-2xl bg-coral-soft px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-sm font-bold text-red-900">
                      <span>{t("До минимальной суммы {sum}", { sum: t.money(short) })}</span>
                      <Link href={`/shop/suppliers/${c.supplierId}`} className="flex shrink-0 items-center gap-1">
                        {t("Добавить")} <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    </div>
                    <Progress value={c.total / c.min} tone="coral" className="mt-2 bg-white/60" />
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-bold text-brand-700">
                    <Check className="size-4" strokeWidth={2.6} aria-hidden />
                    {t("Минимальная сумма набрана")}
                  </div>
                ))}
            </section>
          );
        })}
        {active.length > 1 && owner && !blocked && (
          <Card className="mt-6 scroll-mt-4 rounded-[1.75rem] ring-0" id="checkout-all">
            <h2 className="mb-1 font-display text-lg font-semibold">{t("Оформить выбранное сразу")}</h2>
            <p className="mb-4 text-sm text-gray-500">{t("У каждого поставщика будет свой заказ. Если какой-то не получится оформить, он останется в корзине.")}</p>
            <CheckoutAllForm count={active.length} total={t.money(sum)} defaults={defaults} itemIds={selected} />
          </Card>
        )}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+max(0.625rem,env(safe-area-inset-bottom)))] z-[999] px-3 md:bottom-4">
        <div className="pointer-events-auto mx-auto flex max-w-xl items-center gap-3 rounded-[1.75rem] bg-lime py-3 pr-3 pl-5 text-night shadow-[0_10px_30px_-10px_rgb(0_0_0/0.35)]" data-testid="cart-total-bar">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="truncate text-sm font-semibold">
              {selected.length === allIds.length ? t("Итого · поставщиков: {n}", { n: active.length }) : t("Выбрано {n} из {m}", { n: selected.length, m: allIds.length })}
            </div>
            <Money text={t.money(sum)} className="block font-display text-[1.4rem] font-bold tracking-tight tabular-nums" />
          </div>
          {selected.length === 0 ? (
            <span className="flex h-14 shrink-0 items-center gap-2 rounded-[1.25rem] bg-night/40 px-4 font-bold text-white" aria-disabled="true">
              {t(owner ? "Оформить" : "Открыть")}
            </span>
          ) : (
            <Link
              href={!owner ? `/shop/cart/${(one ?? active[0]).supplierId}` : one ? oneHref : "#checkout-all"}
              className="flex h-14 shrink-0 items-center gap-2 rounded-[1.25rem] bg-night px-4 font-bold text-white"
              data-testid="cart-checkout"
            >
              {t(owner ? "Оформить" : "Открыть")}
              <ArrowRight className="size-5 text-lime" strokeWidth={2.4} aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

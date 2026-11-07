"use client";

import Link from "next/link";
import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Check, Heart, Minus, Plus, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Button, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { addToCartAction, removeOneFromCartAction, askOwnerAction, cancelOrderAction, checkoutAction, checkoutAllAction, repeatOrderAction, requestCancelAction, setCartQtyAction, toggleFavoriteAction } from "@/app/shop/orders/actions";
import { useT } from "@/lib/i18n/client";
import { tapHaptic } from "@/lib/native";
import { formatQty } from "@/lib/catalog";

export function AddToCartForm({ supplierId, unitId, step, max }: { supplierId: string; unitId: string; step: string; max: number }) {
  const t = useT();
  const [state, action, pending] = useActionState(addToCartAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-2">
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="unitId" value={unitId} />
      <div className="flex gap-2">
        <Input name="qty" type="number" inputMode="decimal" min={step} step={step} max={max} defaultValue="1" aria-label={t("Количество")} className="w-24" />
        <SubmitButton pendingText="Добавляю…" className="flex-1">{t("В корзину")}</SubmitButton>
      </div>
      <FormMessage state={state} />
    </ActionForm>
  );
}

// Счётчик на карточке товара: «+» кладёт одну единицу в корзину, после этого рядом появляются «−» и количество.
// Число меняется сразу под пальцем (оптимистично), сервер проверяет остаток; при отказе число возвращается и видна причина.
// row — строка списка товаров поставщика: счётчик фиксированной ширины справа, как в макете
export function CartStepper({
  supplierId,
  unitId,
  qty,
  max,
  label,
  unit,
  row,
}: {
  supplierId: string;
  unitId: string;
  qty: number;
  max: number;
  label: string;
  unit: string;
  row?: boolean;
}) {
  const t = useT();
  const [shown, step] = useOptimistic(qty, (cur: number, delta: number) => Math.max(0, Math.round((cur + delta) * 1000) / 1000));
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function change(delta: 1 | -1) {
    setError(null);
    tapHaptic();
    start(async () => {
      step(delta);
      const fd = new FormData();
      fd.set("supplierId", supplierId);
      fd.set("unitId", unitId);
      fd.set("qty", "1");
      const r = await (delta > 0 ? addToCartAction : removeOneFromCartAction)(initialFormState, fd);
      if (r.error) setError(r.error);
    });
  }

  const status = <span className="sr-only" role="status">{error ? t(error) : shown > 0 ? t("В корзине: {qty}", { qty: `${formatQty(shown)} ${unit}` }) : ""}</span>;
  if (shown <= 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => change(1)}
          aria-label={t("Добавить в корзину: {name}", { name: label })}
          title={error ? t(error) : undefined}
          className={cn(
            "grid shrink-0 place-items-center rounded-full",
            row ? "size-11" : "size-9",
            error ? "bg-red-100 text-red-700" : "bg-accent text-on-accent hover:brightness-95",
          )}
        >
          {error ? <span aria-hidden className="font-bold">!</span> : <Plus className="size-[18px]" strokeWidth={2.6} aria-hidden />}
        </button>
        {error && <p className="w-full text-xs leading-tight text-red-600">{t(error)}</p>}
        {status}
      </>
    );
  }
  return (
    <>
      <div className={cn("stepper-in flex items-center justify-between rounded-full bg-accent text-on-accent", row ? "h-11 w-[8.25rem] shrink-0 p-1" : "h-9 w-full p-0.5")}>
        <button
          type="button"
          onClick={() => change(-1)}
          aria-label={t("Убрать одну: {name}", { name: label })}
          className={cn("grid place-items-center rounded-full hover:bg-black/10", row ? "size-9" : "size-8 bg-black/10")}
        >
          {shown > 1 ? <Minus className="size-4" strokeWidth={2.6} aria-hidden /> : <Trash2 className="size-4" strokeWidth={2.2} aria-hidden />}
        </button>
        <span key={shown} className={cn("count-pop min-w-0 truncate px-1 font-bold tabular-nums", row ? "text-base" : "text-sm")}>
          {formatQty(shown)} {!row && <span className="font-medium opacity-75">{unit}</span>}
        </span>
        <button
          type="button"
          onClick={() => change(1)}
          disabled={shown >= max}
          aria-label={t("Добавить ещё: {name}", { name: label })}
          className={cn("grid place-items-center rounded-full hover:bg-black/10 disabled:opacity-40", row ? "size-9" : "size-8 bg-black/10")}
        >
          <Plus className="size-4" strokeWidth={2.6} aria-hidden />
        </button>
      </div>
      {error && <p className="w-full text-xs leading-tight text-red-600">{t(error)}</p>}
      {status}
    </>
  );
}

export type BuyUnit = { id: string; label: string; price: number; priceText: string; avail: number; inCart: number; fraction: boolean };

// Страница товара (макет): выбор единицы продажи карточками и нижняя тёмная плашка «− N +» и «В корзину · сумма»
export function ProductBuy({ supplierId, units, canOrder }: { supplierId: string; units: BuyUnit[]; canOrder: boolean }) {
  const t = useT();
  const first = units.find((u) => u.avail > 0) ?? units[0];
  const [unitId, setUnitId] = useState(first?.id);
  // Количество можно и набрать с клавиатуры (опт — десятки штук), и менять «−» / «+»
  const [text, setText] = useState("1");
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const unit = units.find((u) => u.id === unitId) ?? first;
  if (!unit) return null;
  const max = Math.max(0, unit.avail - unit.inCart);
  const money = (n: number) => t.money(n);
  const parsed = Number(text.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0 && (unit.fraction || Number.isInteger(parsed));
  const qty = valid ? parsed : 0;
  const step = (d: number) => setText(String(Math.min(Math.max(1, max), Math.max(1, Math.floor(qty || 1) + d))));

  function add() {
    setState({});
    if (!valid) return setState({ error: "Укажите количество" });
    tapHaptic();
    start(async () => {
      const fd = new FormData();
      fd.set("supplierId", supplierId);
      fd.set("unitId", unit.id);
      fd.set("qty", String(qty));
      const r = await addToCartAction(initialFormState, fd);
      setState(r.error ? { error: r.error } : { ok: r.message });
      if (!r.error) setText("1");
    });
  }

  return (
    <>
      {units.length > 1 && (
        <section>
          <h2 className="mb-2.5 text-[15px] font-bold">{t("Единица продажи")}</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {units.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setUnitId(u.id);
                  setText("1");
                  setState({});
                }}
                aria-pressed={u.id === unit.id}
                className={cn("rounded-[1.25rem] px-4 py-3 text-left", u.id === unit.id ? "bg-night text-white" : "bg-surface")}
              >
                <span className={cn("block text-sm font-semibold", u.id === unit.id ? "text-white/80" : "text-gray-500")}>{u.label}</span>
                <span className={cn("block font-display text-lg font-bold whitespace-nowrap tabular-nums", u.id === unit.id && "text-lime")}>{u.priceText}</span>
                <span className={cn("block text-xs", u.avail > 0 ? (u.id === unit.id ? "text-white/60" : "text-gray-500") : "text-red-600")}>
                  {u.avail > 0 ? t("в наличии {qty}", { qty: formatQty(u.avail) }) : t("нет в наличии")}
                  {u.inCart > 0 && ` · ${t("в корзине {qty}", { qty: formatQty(u.inCart) })}`}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {units.length === 1 && unit.inCart > 0 && <p className="text-sm font-semibold text-brand-700">{t("в корзине {qty}", { qty: `${formatQty(unit.inCart)} ${unit.label}` })}</p>}
      {canOrder && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1000] bg-linear-to-t from-page from-40% to-transparent px-3 pt-6 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          {(state.error || state.ok) && (
            <p role="status" className={cn("animate-rise pointer-events-auto mx-auto mb-2 max-w-xl rounded-2xl px-4 py-2.5 text-sm font-semibold", state.error ? "bg-coral-soft text-red-800" : "bg-night text-lime")}>
              {state.error ? t(state.error) : <span className="flex items-center gap-2"><Check className="size-4" aria-hidden />{t(state.ok!)}</span>}
            </p>
          )}
          <div className="pointer-events-auto mx-auto flex max-w-xl gap-2 rounded-[1.75rem] bg-night p-2 shadow-[0_14px_34px_-10px_rgb(0_0_0/0.45)]">
            <div className="flex h-16 items-center rounded-[1.25rem] bg-night-2 px-1 text-white">
              <button type="button" onClick={() => step(-1)} disabled={valid && qty <= 1} aria-label={t("Меньше")} className="grid size-12 place-items-center rounded-full disabled:opacity-40">
                <Minus className="size-5" strokeWidth={2.4} aria-hidden />
              </button>
              <input
                name="qty"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setState({});
                }}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => e.key === "Enter" && add()}
                inputMode={unit.fraction ? "decimal" : "numeric"}
                enterKeyHint="done"
                aria-label={t("Количество")}
                style={{ width: `${Math.min(7, Math.max(2, text.length)) + 1}ch` }}
                className="bg-transparent text-center text-xl font-bold tabular-nums focus:outline-none"
              />
              <button type="button" onClick={() => step(1)} disabled={valid && qty >= max} aria-label={t("Больше")} className="grid size-12 place-items-center rounded-full disabled:opacity-40">
                <Plus className="size-5" strokeWidth={2.4} aria-hidden />
              </button>
            </div>
            <button
              type="button"
              onClick={add}
              disabled={pending || max <= 0}
              className="flex h-16 min-w-0 flex-1 flex-col items-center justify-center rounded-[1.25rem] bg-lime px-3 text-night disabled:opacity-50"
            >
              <span className="truncate text-base leading-tight font-bold">{max <= 0 ? t("Нет в наличии") : pending ? t("Добавляю…") : t("В корзину")}</span>
              {max > 0 && valid && <span className="text-sm font-semibold tabular-nums">{money(unit.price * qty)}</span>}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function CartQtyForm({ itemId, qty, step }: { itemId: string; qty: string; step: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(setCartQtyAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-1">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex items-center gap-2">
        <Input name="qty" type="number" inputMode="decimal" min={step} step={step} defaultValue={qty} aria-label={t("Количество")} className="w-24" />
        <SubmitButton variant="secondary" pendingText="…">OK</SubmitButton>
        <SubmitButton variant="ghost" name="remove" value="1" pendingText="…" aria-label={t("Убрать из корзины")}>✕</SubmitButton>
      </div>
      {state.error && <p className="text-xs text-red-600">{t(state.error)}</p>}
    </ActionForm>
  );
}

export type CheckoutDefaults = { address: string; contactName: string; contactPhone: string };

export function CheckoutForm({ supplierId, defaults, dates }: { supplierId: string; defaults: CheckoutDefaults; dates?: { value: string; label: string }[] }) {
  const t = useT();
  const [state, action, pending] = useActionState(checkoutAction, initialFormState);
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="supplierId" value={supplierId} />
      <Field label="Способ оплаты" name="paymentMethod" error={fe.paymentMethod} hint="Платформа только фиксирует способ оплаты, деньги передаются напрямую поставщику">
        <Select name="paymentMethod" defaultValue={v.paymentMethod ?? "CASH"}>
          <option value="CASH">{t("Наличные")}</option>
          <option value="CARD">{t("Карта")}</option>
          <option value="TRANSFER">{t("Безналичный расчёт")}</option>
        </Select>
      </Field>
      <Field label="Адрес доставки" name="deliveryAddress" error={fe.deliveryAddress}>
        <Input name="deliveryAddress" defaultValue={v.deliveryAddress ?? defaults.address} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Контактное лицо" name="contactName" error={fe.contactName}>
          <Input name="contactName" defaultValue={v.contactName ?? defaults.contactName} />
        </Field>
        <Field label="Телефон" name="contactPhone" error={fe.contactPhone}>
          <Input name="contactPhone" type="tel" inputMode="tel" defaultValue={v.contactPhone ?? defaults.contactPhone} />
        </Field>
      </div>
      {dates ? (
        <Field label="Дата доставки" name="deliveryDate" error={fe.deliveryDate} hint="Поставщик доставляет только в эти дни">
          <Select name="deliveryDate" defaultValue={v.deliveryDate ?? dates[0]?.value}>
            {dates.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Желаемая дата доставки" name="deliveryDate" error={fe.deliveryDate} hint="Необязательно">
          <Input name="deliveryDate" type="date" defaultValue={v.deliveryDate} />
        </Field>
      )}
      <Field label="Комментарий" name="comment">
        <Textarea name="comment" defaultValue={v.comment} placeholder={t("Например: звонить за час, вход со двора")} />
      </Field>
      <SubmitButton pendingText="Оформляю…" className="w-full">{t("Оформить заказ")}</SubmitButton>
    </ActionForm>
  );
}

export function CancelOrderForm({ orderId }: { orderId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(cancelOrderAction, initialFormState);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Причина отмены" name="reason" error={state.fieldErrors?.reason}>
        <Input name="reason" defaultValue={state.values?.reason} />
      </Field>
      <SubmitButton variant="danger" pendingText="Отменяю…" confirm="Отменить заказ?">{t("Отменить заказ")}</SubmitButton>
    </ActionForm>
  );
}

export function RequestCancelForm({ orderId }: { orderId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(requestCancelAction, initialFormState);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <p className="text-sm text-gray-600">{t("Заказ уже в пути: отмена возможна только с согласия поставщика.")}</p>
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Причина" name="reason" error={state.fieldErrors?.reason}>
        <Input name="reason" defaultValue={state.values?.reason} />
      </Field>
      <SubmitButton variant="secondary" pendingText="Отправляю…">{t("Попросить отмену")}</SubmitButton>
    </ActionForm>
  );
}

// QR показывается только по нажатию — в момент передачи товара (ТЗ п. 34)
export function ConfirmReceiptQr({ dataUrl, code }: { dataUrl: string; code: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!open) return <Button className="w-full" onClick={() => setOpen(true)}>{t("Подтвердить получение")}</Button>;
  return (
    <div className="space-y-2 text-center">
      <p className="text-sm text-gray-600">{t("Проверьте товар и сумму, затем покажите QR доставщику.")}</p>
      <img src={dataUrl} alt={t("QR-код подтверждения получения")} className="mx-auto w-64 max-w-full" />
      <p className="font-mono text-lg tracking-widest">{code.replace(/(.{5})/, "$1 ")}</p>
      <button type="button" className="text-sm text-gray-600 underline" onClick={() => setOpen(false)}>{t("Скрыть")}</button>
    </div>
  );
}

export function RepeatOrderForm({ orderId }: { orderId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(repeatOrderAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-2">
      <FormMessage state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      {state.ok && state.values?.supplierId ? (
        <Link href={`/shop/cart/${state.values.supplierId}`} className="inline-flex min-h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-on-brand">{t("Перейти в корзину")}</Link>
      ) : (
        <SubmitButton variant="secondary" pendingText="Добавляю…">{t("Повторить заказ")}</SubmitButton>
      )}
    </ActionForm>
  );
}

export function FavoriteButton({ productId, on, label, heart }: { productId: string; on: boolean; label: string; heart?: boolean }) {
  const t = useT();
  if (heart) {
    // Шапка товара (макет): тёмная круглая кнопка с сердцем
    return (
      <form action={toggleFavoriteAction}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="on" value={on ? "0" : "1"} />
        <button aria-pressed={on} aria-label={t(on ? "Убрать из моих товаров: {name}" : "В мои товары: {name}", { name: label })} className="grid size-12 place-items-center rounded-full bg-night">
          <Heart className={cn("size-5", on ? "fill-coral text-coral" : "text-white")} strokeWidth={2.2} aria-hidden />
        </button>
      </form>
    );
  }
  return (
    <form action={toggleFavoriteAction}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="on" value={on ? "0" : "1"} />
      <button
        aria-pressed={on}
        aria-label={t(on ? "Убрать из моих товаров: {name}" : "В мои товары: {name}", { name: label })}
        className={cn("grid size-8 place-items-center rounded-full bg-surface/90 text-lg shadow-sm ring-1 ring-black/5", on ? "text-amber-500" : "text-gray-400 hover:text-amber-500")}
      >
        <span aria-hidden>{on ? "★" : "☆"}</span>
      </button>
    </form>
  );
}

// М6: сотрудник магазина просит владельца оформить корзину
export function AskOwnerForm({ supplierId }: { supplierId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(askOwnerAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-2">
      <FormMessage state={state} />
      <input type="hidden" name="supplierId" value={supplierId} />
      <SubmitButton className="w-full">{t("Сообщить владельцу")}</SubmitButton>
    </ActionForm>
  );
}

// М5: одна форма на все корзины; дата доставки — ближайшая доступная у каждого поставщика
export function CheckoutAllForm({ count, total, defaults }: { count: number; total: string; defaults: CheckoutDefaults }) {
  const t = useT();
  const [state, action, pending] = useActionState(checkoutAllAction, initialFormState);
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Способ оплаты" name="paymentMethod" error={fe.paymentMethod}>
          <Select name="paymentMethod" defaultValue={v.paymentMethod ?? "CASH"}>
            <option value="CASH">{t("Наличные")}</option>
            <option value="CARD">{t("Карта")}</option>
            <option value="TRANSFER">{t("Безналичный расчёт")}</option>
          </Select>
        </Field>
        <Field label="Адрес доставки" name="deliveryAddress" error={fe.deliveryAddress}>
          <Input name="deliveryAddress" defaultValue={v.deliveryAddress ?? defaults.address} />
        </Field>
        <Field label="Контактное лицо" name="contactName" error={fe.contactName}>
          <Input name="contactName" defaultValue={v.contactName ?? defaults.contactName} />
        </Field>
        <Field label="Телефон" name="contactPhone" error={fe.contactPhone}>
          <Input name="contactPhone" type="tel" inputMode="tel" defaultValue={v.contactPhone ?? defaults.contactPhone} />
        </Field>
      </div>
      <Field label="Комментарий" name="comment" hint="Дата доставки у каждого поставщика — ближайшая доступная">
        <Textarea name="comment" defaultValue={v.comment} />
      </Field>
      <SubmitButton pendingText="Оформляю…" className="w-full sm:w-auto">{t("Оформить все ({n}) на {sum}", { n: count, sum: total })}</SubmitButton>
    </ActionForm>
  );
}

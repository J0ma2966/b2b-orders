"use client";

import Link from "next/link";
import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
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
export function CartStepper({ supplierId, unitId, qty, max, label, unit }: { supplierId: string; unitId: string; qty: number; max: number; label: string; unit: string }) {
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
          className={cn("grid size-9 shrink-0 place-items-center rounded-full", error ? "bg-red-100 text-red-700" : "bg-accent text-on-accent hover:brightness-95")}
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
      <div className="stepper-in flex h-9 w-full items-center justify-between rounded-full bg-accent p-0.5 text-on-accent">
        <button
          type="button"
          onClick={() => change(-1)}
          aria-label={t("Убрать одну: {name}", { name: label })}
          className="grid size-8 place-items-center rounded-full bg-black/10 hover:bg-black/15"
        >
          {shown > 1 ? <Minus className="size-4" strokeWidth={2.6} aria-hidden /> : <Trash2 className="size-4" strokeWidth={2.2} aria-hidden />}
        </button>
        <span key={shown} className="count-pop min-w-0 truncate px-1 text-sm font-bold tabular-nums">
          {formatQty(shown)} <span className="font-medium opacity-75">{unit}</span>
        </span>
        <button
          type="button"
          onClick={() => change(1)}
          disabled={shown >= max}
          aria-label={t("Добавить ещё: {name}", { name: label })}
          className="grid size-8 place-items-center rounded-full bg-black/10 hover:bg-black/15 disabled:opacity-40"
        >
          <Plus className="size-4" strokeWidth={2.6} aria-hidden />
        </button>
      </div>
      {error && <p className="w-full text-xs leading-tight text-red-600">{t(error)}</p>}
      {status}
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

export function FavoriteButton({ productId, on, label }: { productId: string; on: boolean; label: string }) {
  const t = useT();
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

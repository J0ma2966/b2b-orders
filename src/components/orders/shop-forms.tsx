"use client";

import { useActionState, useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Button, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { addToCartAction, cancelOrderAction, checkoutAction, requestCancelAction, setCartQtyAction } from "@/app/shop/orders/actions";
import { useT } from "@/lib/i18n/client";

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

// Кнопка «+» на карточке товара: одна единица в корзину без перехода на страницу товара
export function QuickAddButton({ supplierId, unitId, label }: { supplierId: string; unitId: string; label: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(addToCartAction, initialFormState);
  const added = state.ok && !pending;
  return (
    <ActionForm action={action} pending={pending} className="shrink-0">
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="qty" value="1" />
      <button
        disabled={pending}
        aria-label={t("Добавить в корзину: {name}", { name: label })}
        title={state.error ? t(state.error) : undefined}
        className={cn(
          "grid size-9 place-items-center rounded-full text-lg font-semibold transition-colors",
          added ? "bg-brand-600 text-on-brand" : state.error ? "bg-red-100 text-red-700" : "bg-accent text-on-accent hover:brightness-95",
          pending && "opacity-60",
        )}
      >
        <span aria-hidden>{added ? "✓" : state.error ? "!" : "+"}</span>
      </button>
      <span className="sr-only" role="status">{added ? t(state.message) : state.error ? t(state.error) : ""}</span>
    </ActionForm>
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

export function CheckoutForm({ supplierId, defaults }: { supplierId: string; defaults: CheckoutDefaults }) {
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
      <Field label="Желаемая дата доставки" name="deliveryDate" error={fe.deliveryDate} hint="Необязательно">
        <Input name="deliveryDate" type="date" defaultValue={v.deliveryDate} />
      </Field>
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

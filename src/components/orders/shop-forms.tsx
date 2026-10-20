"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { addToCartAction, cancelOrderAction, checkoutAction, setCartQtyAction } from "@/app/shop/orders/actions";

export function AddToCartForm({ supplierId, unitId, step, max }: { supplierId: string; unitId: string; step: string; max: number }) {
  const [state, action, pending] = useActionState(addToCartAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-2">
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="unitId" value={unitId} />
      <div className="flex gap-2">
        <Input name="qty" type="number" inputMode="decimal" min={step} step={step} max={max} defaultValue="1" aria-label="Количество" className="w-24" />
        <SubmitButton pendingText="Добавляю…" className="flex-1">В корзину</SubmitButton>
      </div>
      <FormMessage state={state} />
    </ActionForm>
  );
}

export function CartQtyForm({ itemId, qty, step }: { itemId: string; qty: string; step: string }) {
  const [state, action, pending] = useActionState(setCartQtyAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-1">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex items-center gap-2">
        <Input name="qty" type="number" inputMode="decimal" min={step} step={step} defaultValue={qty} aria-label="Количество" className="w-24" />
        <SubmitButton variant="secondary" pendingText="…">OK</SubmitButton>
        <SubmitButton variant="ghost" name="remove" value="1" pendingText="…" aria-label="Убрать из корзины">✕</SubmitButton>
      </div>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </ActionForm>
  );
}

export type CheckoutDefaults = { address: string; contactName: string; contactPhone: string };

export function CheckoutForm({ supplierId, defaults }: { supplierId: string; defaults: CheckoutDefaults }) {
  const [state, action, pending] = useActionState(checkoutAction, initialFormState);
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="supplierId" value={supplierId} />
      <Field label="Способ оплаты" name="paymentMethod" error={fe.paymentMethod} hint="Платформа только фиксирует способ оплаты, деньги передаются напрямую поставщику">
        <Select name="paymentMethod" defaultValue={v.paymentMethod ?? "CASH"}>
          <option value="CASH">Наличные</option>
          <option value="CARD">Карта</option>
          <option value="TRANSFER">Безналичный расчёт</option>
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
        <Textarea name="comment" defaultValue={v.comment} placeholder="Например: звонить за час, вход со двора" />
      </Field>
      <SubmitButton pendingText="Оформляю…" className="w-full">Оформить заказ</SubmitButton>
    </ActionForm>
  );
}

export function CancelOrderForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(cancelOrderAction, initialFormState);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Причина отмены" name="reason" error={state.fieldErrors?.reason}>
        <Input name="reason" defaultValue={state.values?.reason} />
      </Field>
      <SubmitButton variant="danger" pendingText="Отменяю…" confirm="Отменить заказ?">Отменить заказ</SubmitButton>
    </ActionForm>
  );
}

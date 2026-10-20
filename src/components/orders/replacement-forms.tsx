"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { REPLACEMENT_REASONS, RETURNED_STATUS_LABEL } from "@/lib/replacement-core";
import { createReplacementAction } from "@/app/shop/replacements/actions";
import { assignReplacementAction, decideReplacementAction, returnedStatusAction } from "@/app/supplier/replacements/actions";
import { completeReplacementAction } from "@/app/courier/replacements/actions";
import type { ReturnedStatus } from "@/generated/prisma/enums";

export function NewReplacementForm({ orderId, items }: { orderId: string; items: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createReplacementAction, initialFormState);
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Товар" name="orderItemId" error={fe.orderItemId}>
        <Select name="orderItemId" defaultValue={v.orderItemId ?? (items.length === 1 ? items[0].id : "")}>
          <option value="">— выберите —</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Количество" name="qty" error={fe.qty}>
          <Input name="qty" inputMode="decimal" defaultValue={v.qty ?? "1"} />
        </Field>
        <Field label="Причина" name="reason" error={fe.reason}>
          <Select name="reason" defaultValue={v.reason ?? ""}>
            <option value="">— выберите —</option>
            {REPLACEMENT_REASONS.map((r) => <option key={r}>{r}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Комментарий" name="comment" error={fe.comment}>
        <Textarea name="comment" defaultValue={v.comment} />
      </Field>
      <Field label="Фото" name="photos" hint="JPG, PNG, WEBP до 10 МБ">
        <Input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" />
      </Field>
      <Field label="Видео" name="videos" hint="MP4, WEBM, MOV до 50 МБ">
        <Input name="videos" type="file" accept="video/mp4,video/webm,video/quicktime" />
      </Field>
      <SubmitButton pendingText="Отправляю…">Отправить заявку</SubmitButton>
    </ActionForm>
  );
}

export function DecideReplacementForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(decideReplacementAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <Field label="Комментарий магазину" name="comment" error={state.fieldErrors?.comment}>
        <Input name="comment" defaultValue={state.values?.comment} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="approve" pendingText="…">Согласовать и зарезервировать</SubmitButton>
        <SubmitButton name="decision" value="reject" variant="danger" pendingText="…">Отклонить</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AssignReplacementForm({ id, couriers, orders }: { id: string; couriers: { id: string; name: string }[]; orders: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(assignReplacementAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <Field label="Отдельным заданием доставщику" name="courierId">
        <Select name="courierId" defaultValue="">
          <option value="">—</option>
          {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      {orders.length > 0 && (
        <Field label="или вместе с новым заказом магазина" name="orderId">
          <Select name="orderId" defaultValue="">
            <option value="">—</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        </Field>
      )}
      <SubmitButton pendingText="…">Назначить</SubmitButton>
    </ActionForm>
  );
}

export function CompleteReplacementForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(completeReplacementAction, initialFormState);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <Field label="Фото забранного товара" name="photos">
        <Input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" />
      </Field>
      <Field label="Комментарий" name="comment">
        <Input name="comment" />
      </Field>
      <SubmitButton pendingText="…" confirm="Подтвердить: новый товар передан, старый забран?">Передал новый, забрал старый</SubmitButton>
    </ActionForm>
  );
}

export function ReturnedStatusForm({ id, current, options }: { id: string; current: ReturnedStatus; options: ReturnedStatus[] }) {
  const [state, action, pending] = useActionState(returnedStatusAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <Select name="status" defaultValue={current} aria-label="Статус" className="w-48">
        {options.map((s) => <option key={s} value={s}>{RETURNED_STATUS_LABEL[s]}</option>)}
      </Select>
      <Input name="comment" placeholder="Комментарий" aria-label="Комментарий" className="w-48" />
      <SubmitButton variant="secondary" pendingText="…" confirm={undefined}>Сохранить</SubmitButton>
      {(state.error || state.message) && <p className={state.error ? "w-full text-xs text-red-600" : "w-full text-xs text-green-700"}>{state.error ?? state.message}</p>}
    </ActionForm>
  );
}

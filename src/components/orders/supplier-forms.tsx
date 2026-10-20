"use client";

import { useActionState, useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { SUPPLIER_ACTION_LABEL, SUPPLIER_ACTION_NEEDS_REASON, type SupplierOrderAction } from "@/lib/order-core";
import { addForcedAction, assignCourierAction, cancelRequestDecisionAction, orderCorrectionAction, orderStatusAction, resolveProblemAction } from "@/app/supplier/orders/actions";

export function OrderStatusForm({ orderId, actions }: { orderId: string; actions: SupplierOrderAction[] }) {
  const [state, action, pending] = useActionState(orderStatusAction, initialFormState);
  const [withReason, setWithReason] = useState<SupplierOrderAction | null>(null);
  const forward = actions.filter((a) => !SUPPLIER_ACTION_NEEDS_REASON.includes(a));
  const negative = actions.filter((a) => SUPPLIER_ACTION_NEEDS_REASON.includes(a));
  // Действие из прошлого статуса могло исчезнуть после ответа сервера
  const current = withReason && negative.includes(withReason) ? withReason : null;
  return (
    <div className="space-y-3">
      <FormMessage state={state} />
      {forward.length > 0 && (
        <ActionForm action={action} pending={pending} className="flex flex-wrap gap-2">
          <input type="hidden" name="orderId" value={orderId} />
          {forward.map((a) => (
            <SubmitButton key={a} name="action" value={a} pendingText="…">{SUPPLIER_ACTION_LABEL[a]}</SubmitButton>
          ))}
        </ActionForm>
      )}
      {negative.length > 0 && !current && (
        <div className="flex flex-wrap gap-2">
          {negative.map((a) => (
            <button key={a} type="button" className="text-sm text-red-600 underline" onClick={() => setWithReason(a)}>
              {SUPPLIER_ACTION_LABEL[a]}
            </button>
          ))}
        </div>
      )}
      {current && (
        <ActionForm action={action} pending={pending} className="space-y-3 rounded-lg bg-red-50 p-3">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="action" value={current} />
          <Field label="Причина (её увидит магазин)" name="reason" error={state.fieldErrors?.reason}>
            <Input name="reason" defaultValue={state.values?.reason} />
          </Field>
          <div className="flex gap-2">
            <SubmitButton variant="danger" pendingText="…">{SUPPLIER_ACTION_LABEL[current]}</SubmitButton>
            <button type="button" className="text-sm text-gray-600" onClick={() => setWithReason(null)}>Не нужно</button>
          </div>
        </ActionForm>
      )}
    </div>
  );
}

export function AssignCourierForm({ orderId, couriers, current }: { orderId: string; couriers: { id: string; name: string; active: number }[]; current: string | null }) {
  const [state, action, pending] = useActionState(assignCourierAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      {couriers.length === 0 ? (
        <p className="text-sm text-gray-500">Нет доставщиков. Добавьте их в разделе «Сотрудники и доставщики».</p>
      ) : (
        <>
          <Field label="Доставщик" name="courierId">
            <Select name="courierId" defaultValue={current ?? ""}>
              <option value="">— не назначен —</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · в работе {c.active}</option>
              ))}
            </Select>
          </Field>
          <SubmitButton pendingText="Сохраняю…">{current ? "Сохранить" : "Назначить"}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ForcedItemForm({ orderId, units }: { orderId: string; units: { id: string; label: string; available: string }[] }) {
  const [state, action, pending] = useActionState(addForcedAction, initialFormState);
  const fe = state.fieldErrors ?? {};
  return (
    <ActionForm key={state.at ?? "f"} action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Товар" name="unitId" error={fe.unitId}>
        <Select name="unitId" defaultValue={state.values?.unitId ?? ""}>
          <option value="">— выберите —</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.label} · доступно {u.available}</option>
          ))}
        </Select>
      </Field>
      <Field label="Количество" name="qty" error={fe.qty}>
        <Input name="qty" inputMode="decimal" defaultValue={state.values?.qty} className="w-32" />
      </Field>
      <SubmitButton variant="secondary" pendingText="Добавляю…">Добавить как принудительную продажу</SubmitButton>
    </ActionForm>
  );
}

export function CancelRequestDecisionForm({ orderId, reason }: { orderId: string; reason: string }) {
  const [state, action, pending] = useActionState(cancelRequestDecisionAction, initialFormState);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <p className="text-sm">Магазин просит отменить заказ в пути. Причина: <b>{reason}</b></p>
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Комментарий магазину" name="comment">
        <Input name="comment" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="approve" variant="danger" pendingText="…">Согласовать отмену</SubmitButton>
        <SubmitButton name="decision" value="decline" variant="secondary" pendingText="…">Отказать, доставлять</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ResolveProblemForm({ orderId, note }: { orderId: string; note: string }) {
  const [state, action, pending] = useActionState(resolveProblemAction, initialFormState);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <p className="text-sm">Доставщик сообщил о проблеме: <b>{note}</b></p>
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Комментарий (для отмены обязателен)" name="comment">
        <Input name="comment" defaultValue={state.values?.comment} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="resolution" value="continue" pendingText="…">Продолжить доставку</SubmitButton>
        <SubmitButton name="resolution" value="back_to_ready" variant="secondary" pendingText="…">Вернуть на склад</SubmitButton>
        <SubmitButton name="resolution" value="cancel" variant="danger" pendingText="…" confirm="Отменить заказ и освободить резерв?">Отменить заказ</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function CorrectionForm({ orderId, shopId }: { orderId?: string; shopId: string }) {
  const [state, action, pending] = useActionState(orderCorrectionAction, initialFormState);
  const fe = state.fieldErrors ?? {};
  return (
    <ActionForm key={state.at ?? "c"} action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="orderId" value={orderId ?? ""} />
      <input type="hidden" name="shopId" value={shopId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Сумма (+ увеличивает долг)" name="amount" error={fe.amount}>
          <Input name="amount" inputMode="decimal" placeholder="+200" defaultValue={state.values?.amount} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Основание" name="reason" error={fe.reason}>
            <Input name="reason" defaultValue={state.values?.reason} />
          </Field>
        </div>
      </div>
      <SubmitButton variant="secondary" pendingText="…" confirm="Записать корректирующую операцию? Исходные записи останутся в истории.">Записать корректировку</SubmitButton>
    </ActionForm>
  );
}

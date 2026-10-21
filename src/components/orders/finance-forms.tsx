"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { debtPaymentAction, setCreditAction } from "@/app/supplier/shops/actions";
import { useT } from "@/lib/i18n/client";

export function CreditForm({ shopId, creditAllowed, creditLimit, paymentTermDays = "" }: { shopId: string; creditAllowed: boolean; creditLimit: string; paymentTermDays?: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(setCreditAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="shopId" value={shopId} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="creditAllowed" defaultChecked={creditAllowed} /> {t("Разрешить работу в долг")}
      </label>
      <Field label="Лимит задолженности, сум" name="creditLimit" error={state.fieldErrors?.creditLimit} hint="Пусто — без лимита">
        <Input name="creditLimit" inputMode="decimal" defaultValue={state.values?.creditLimit ?? creditLimit} />
      </Field>
      <Field label="Отсрочка оплаты, дней" name="paymentTermDays" error={state.fieldErrors?.paymentTermDays} hint="Пусто — без срока. При просрочке новые заказы только с полной оплатой">
        <Input name="paymentTermDays" type="number" min={1} max={365} defaultValue={state.values?.paymentTermDays ?? paymentTermDays} />
      </Field>
      <SubmitButton variant="secondary">{t("Сохранить")}</SubmitButton>
    </ActionForm>
  );
}

export function DebtPaymentForm({ shopId, today }: { shopId: string; today: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(debtPaymentAction, initialFormState);
  const fe = state.fieldErrors ?? {};
  return (
    <ActionForm key={state.at ?? "p"} action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="shopId" value={shopId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Сумма" name="amount" error={fe.amount}>
          <Input name="amount" inputMode="decimal" defaultValue={state.values?.amount} />
        </Field>
        <Field label="Дата" name="date" error={fe.date}>
          <Input name="date" type="date" defaultValue={state.values?.date ?? today} />
        </Field>
        <Field label="Способ" name="method">
          <Select name="method" defaultValue={state.values?.method ?? "CASH"}>
            <option value="CASH">{t("Наличные")}</option>
            <option value="CARD">{t("Карта")}</option>
            <option value="TRANSFER">{t("Безналичный")}</option>
          </Select>
        </Field>
      </div>
      <Field label="Комментарий" name="comment">
        <Input name="comment" defaultValue={state.values?.comment} />
      </Field>
      <SubmitButton>{t("Зарегистрировать погашение")}</SubmitButton>
    </ActionForm>
  );
}

"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Field, Input } from "@/components/ui";
import { initialFormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";
import { updateOrderTermsAction } from "../actions";

export type TermsDefaults = { minOrderTotal: string; orderCutoffHour: string; creditOverLimitBlock: boolean; skipAssembly: boolean };

export function OrderTermsForm({ defaults }: { defaults: TermsDefaults }) {
  const t = useT();
  const [state, action, pending] = useActionState(updateOrderTermsAction, initialFormState);
  const v = state.values;
  const fe = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Минимальная сумма заказа, сум" name="minOrderTotal" error={fe.minOrderTotal} hint="Пусто — без минимума">
          <Input name="minOrderTotal" inputMode="numeric" defaultValue={v?.minOrderTotal ?? defaults.minOrderTotal} />
        </Field>
        <Field label="Приём заказов до, час" name="orderCutoffHour" error={fe.orderCutoffHour} hint="Например 16: заказ до 16:00 — доставка завтра, позже — послезавтра. Пусто — можно на сегодня">
          <Input name="orderCutoffHour" type="number" min={1} max={23} defaultValue={v?.orderCutoffHour ?? defaults.orderCutoffHour} />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="creditOverLimitBlock" className="mt-1" defaultChecked={v ? v.creditOverLimitBlock === "on" : defaults.creditOverLimitBlock} />
        <span>
          {t("Не принимать заказы сверх кредитного лимита")}
          <span className="block text-xs text-gray-500">{t("Без галочки заказ оформляется, а вы видите пометку «выше лимита» и сумму, которую нужно получить")}</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="skipAssembly" className="mt-1" defaultChecked={v ? v.skipAssembly === "on" : defaults.skipAssembly} />
        <span>
          {t("Пропускать сборку")}
          <span className="block text-xs text-gray-500">{t("В принятом заказе сразу доступна кнопка «Готов и назначить доставщика»")}</span>
        </span>
      </label>
      <SubmitButton>{t("Сохранить")}</SubmitButton>
    </ActionForm>
  );
}

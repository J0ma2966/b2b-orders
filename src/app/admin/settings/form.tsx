"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { setDefaultCommissionAction, setJobSettingsAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export function DefaultCommissionForm({ current }: { current: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(setDefaultCommissionAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <Field label="Ставка, %" name="rate" error={state.fieldErrors?.rate}>
        <Input name="rate" inputMode="decimal" defaultValue={current} required />
      </Field>
      <SubmitButton>{t("Сохранить")}</SubmitButton>
    </ActionForm>
  );
}

const JOB_FIELDS = [
  ["placedRemindHours", "Напомнить поставщику о новом заказе через, ч"],
  ["placedAutoCancelHours", "Отменить заказ без ответа через, ч"],
  ["problemRemindHours", "Напомнить о проблеме доставки через, ч"],
  ["problemAutoCancelHours", "Отменить заказ с нерешённой проблемой через, ч"],
  ["cartReminderHours", "Напомнить магазину о забытой корзине через, ч"],
] as const;

export function JobSettingsForm({ current }: { current: Record<(typeof JOB_FIELDS)[number][0], number> }) {
  const t = useT();
  const [state, action, pending] = useActionState(setJobSettingsAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      {JOB_FIELDS.map(([name, label]) => (
        <Field key={name} label={label} name={name} error={state.fieldErrors?.[name]}>
          <Input name={name} type="number" min={0} max={720} step="0.5" defaultValue={state.values?.[name] ?? current[name]} required />
        </Field>
      ))}
      <SubmitButton>{t("Сохранить")}</SubmitButton>
    </ActionForm>
  );
}

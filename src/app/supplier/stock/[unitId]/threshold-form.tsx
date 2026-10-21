"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Field, Input } from "@/components/ui";
import { initialFormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";
import { lowStockThresholdAction } from "../../catalog/actions";

export function ThresholdForm({ unitId, current }: { unitId: string; current: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(lowStockThresholdAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="unitId" value={unitId} />
      <Field label="Мало на складе, если доступно меньше" name="threshold" error={state.fieldErrors?.threshold} hint="Пусто — без уведомления">
        <Input name="threshold" inputMode="decimal" className="w-32" defaultValue={state.values?.threshold ?? current} />
      </Field>
      <SubmitButton variant="secondary">{t("Сохранить")}</SubmitButton>
      <div className="basis-full"><FormMessage state={state} /></div>
    </ActionForm>
  );
}

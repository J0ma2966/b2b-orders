"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { setDefaultCommissionAction } from "../actions";
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

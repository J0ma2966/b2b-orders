"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";
import { deleteAccountAction } from "./actions";

export function DeleteAccountForm() {
  const t = useT();
  const [state, action, pending] = useActionState(deleteAccountAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <Field label="Пароль" name="password" error={e.password}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" required className="mt-1" />
        <span>{t("Я понимаю, что аккаунт удаляется навсегда и восстановить его нельзя")}</span>
      </label>
      {e.confirm && <p className="text-sm text-red-600">{t(e.confirm[0])}</p>}
      <SubmitButton variant="danger">{t("Удалить аккаунт навсегда")}</SubmitButton>
    </ActionForm>
  );
}

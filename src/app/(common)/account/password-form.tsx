"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { changePasswordAction } from "@/app/(auth)/actions";
import { useT } from "@/lib/i18n/client";

export function PasswordForm({ needCurrent = true }: { needCurrent?: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState(changePasswordAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      {needCurrent && (
        <Field label="Текущий пароль" name="current" error={e.current}>
          <Input name="current" type="password" autoComplete="current-password" required />
        </Field>
      )}
      <Field label="Новый пароль" name="password" error={e.password} hint="Минимум 8 символов">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Повторите новый пароль" name="password2" error={e.password2}>
        <Input name="password2" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton>{t("Сменить пароль")}</SubmitButton>
    </ActionForm>
  );
}

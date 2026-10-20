"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { loginAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export function LoginForm() {
  const t = useT();
  const [state, action, pending] = useActionState(loginAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field label="Телефон" name="phone" error={state.fieldErrors?.phone}>
        <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+998 90 123-45-67" defaultValue={state.values?.phone} required />
      </Field>
      <Field label="Пароль" name="password" error={state.fieldErrors?.password}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" pendingText="Входим…">{t("Войти")}</SubmitButton>
    </ActionForm>
  );
}

"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { addShopStaffAction, resetShopStaffPasswordAction } from "./actions";
import { useT } from "@/lib/i18n/client";

export function AddStaffForm() {
  const t = useT();
  const [state, action, pending] = useActionState(addShopStaffAction, initialFormState);
  return (
    <ActionForm key={state.at ?? "add"} action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <Field label="ФИО" name="fullName" error={state.fieldErrors?.fullName}>
        <Input name="fullName" defaultValue={state.ok ? "" : state.values?.fullName} required />
      </Field>
      <Field label="Телефон" name="phone" error={state.fieldErrors?.phone} hint="По этому номеру сотрудник будет входить">
        <Input name="phone" type="tel" inputMode="tel" defaultValue={state.ok ? "" : state.values?.phone} required />
      </Field>
      <SubmitButton>{t("Добавить")}</SubmitButton>
    </ActionForm>
  );
}

export function ResetStaffPasswordButton({ memberId }: { memberId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(resetShopStaffPasswordAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="contents">
      <input type="hidden" name="memberId" value={memberId} />
      <SubmitButton variant="ghost" className="min-h-0 px-2 py-1 text-xs" confirm="Выдать новый временный пароль? Сотрудник выйдет на всех устройствах.">
        {t("Сбросить пароль")}
      </SubmitButton>
      {(state.message || state.error) && (
        <div className="w-full basis-full">
          <Alert tone={state.error ? "error" : "success"}>{state.error ?? state.message}</Alert>
        </div>
      )}
    </ActionForm>
  );
}

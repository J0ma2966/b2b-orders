"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { addMemberAction, resetMemberPasswordAction } from "../actions";

export function AddMemberForm({ roles }: { roles: [string, string][] }) {
  const [state, action, pending] = useActionState(addMemberAction, initialFormState);
  return (
    <ActionForm key={state.ok ? state.message : "add"} action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <Field label="Роль" name="role">
        <Select name="role" defaultValue={state.values?.role ?? roles[roles.length - 1][0]}>
          {roles.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </Field>
      <Field label="ФИО" name="fullName" error={state.fieldErrors?.fullName}>
        <Input name="fullName" defaultValue={state.ok ? "" : state.values?.fullName} required />
      </Field>
      <Field label="Телефон" name="phone" error={state.fieldErrors?.phone} hint="По этому номеру сотрудник будет входить">
        <Input name="phone" type="tel" inputMode="tel" defaultValue={state.ok ? "" : state.values?.phone} required />
      </Field>
      <SubmitButton>Добавить</SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordButton({ memberId }: { memberId: string }) {
  const [state, action, pending] = useActionState(resetMemberPasswordAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="contents">
      <input type="hidden" name="memberId" value={memberId} />
      <SubmitButton variant="ghost" className="min-h-0 px-2 py-1 text-xs" confirm="Выдать новый временный пароль? Сотрудник выйдет на всех устройствах.">
        Сбросить пароль
      </SubmitButton>
      {(state.message || state.error) && (
        <div className="w-full basis-full">
          <Alert tone={state.error ? "error" : "success"}>{state.error ?? state.message}</Alert>
        </div>
      )}
    </ActionForm>
  );
}

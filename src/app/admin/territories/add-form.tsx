"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { addTerritoryAction } from "../actions";

export function AddTerritoryForm({ parents }: { parents: { id: string; name: string; type: string }[] }) {
  const [state, action, pending] = useActionState(addTerritoryAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Входит в" name="parentId" error={state.fieldErrors?.parentId}>
          <Select name="parentId" required>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Тип" name="type">
          <Select name="type" defaultValue="CITY">
            <option value="REGION">Регион</option>
            <option value="CITY">Город</option>
            <option value="DISTRICT">Район</option>
          </Select>
        </Field>
        <Field label="Название" name="name" error={state.fieldErrors?.name}>
          <Input name="name" required />
        </Field>
      </div>
      <SubmitButton variant="secondary">Добавить</SubmitButton>
    </ActionForm>
  );
}

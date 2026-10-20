"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { saveCategoryAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export function CategoryForm({ id, name }: { id?: string; name?: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(saveCategoryAction, initialFormState);
  return (
    <ActionForm key={!id ? state.at ?? "f" : "f"} action={action} pending={pending} className="flex flex-wrap items-start gap-2">
      {id && <input type="hidden" name="id" value={id} />}
      <div className="min-w-40 flex-1">
        <Input name="name" defaultValue={name} placeholder={t("Название категории")} aria-label={t("Название категории")} required />
        {state.fieldErrors?.name && <p className="mt-1 text-xs text-red-600">{t(state.fieldErrors.name[0])}</p>}
        {state.ok && state.message && <p className="mt-1 text-xs text-green-700">{t(state.message)}</p>}
      </div>
      <SubmitButton variant="secondary">{id ? "Переименовать" : "Добавить"}</SubmitButton>
    </ActionForm>
  );
}

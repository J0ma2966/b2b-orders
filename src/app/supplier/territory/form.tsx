"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { TerritoryMultiSelect } from "@/components/territory/territory-multi-select";
import type { TerritoryOption } from "@/components/territory/types";
import { initialFormState } from "@/lib/forms";
import { updateTerritoryAction } from "../actions";

export function TerritoryForm({ territories, selected }: { territories: TerritoryOption[]; selected: string[] }) {
  const [state, action, pending] = useActionState(updateTerritoryAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <FormMessage state={state} />
      <p className="text-sm text-gray-500">Магазины из отмеченных регионов, городов и районов увидят ваш каталог.</p>
      <TerritoryMultiSelect territories={territories} defaultValue={selected} />
      <SubmitButton>Сохранить</SubmitButton>
    </ActionForm>
  );
}

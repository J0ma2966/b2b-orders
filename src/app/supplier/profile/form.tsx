"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { SupplierFields, type SupplierDefaults } from "@/components/forms/supplier-fields";
import type { TerritoryOption } from "@/components/territory/types";
import { initialFormState } from "@/lib/forms";
import { updateSupplierProfileAction } from "../actions";

export function ProfileForm({ territories, defaults }: { territories: TerritoryOption[]; defaults: SupplierDefaults }) {
  const [state, action, pending] = useActionState(updateSupplierProfileAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-6">
      <FormMessage state={state} />
      <SupplierFields state={state} territories={territories} defaults={defaults} showDeliveryTerritory={false} innReadOnly />
      <SubmitButton>Сохранить</SubmitButton>
    </ActionForm>
  );
}

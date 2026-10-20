"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { SupplierFields, type SupplierDefaults } from "@/components/forms/supplier-fields";
import type { TerritoryOption } from "@/components/territory/types";
import { initialFormState } from "@/lib/forms";
import { updateSupplierProfileAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export function ProfileForm({ territories, defaults }: { territories: TerritoryOption[]; defaults: SupplierDefaults }) {
  const t = useT();
  const [state, action, pending] = useActionState(updateSupplierProfileAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-6">
      <FormMessage state={state} />
      <SupplierFields state={state} territories={territories} defaults={defaults} showDeliveryTerritory={false} innReadOnly />
      <SubmitButton>{t("Сохранить")}</SubmitButton>
    </ActionForm>
  );
}

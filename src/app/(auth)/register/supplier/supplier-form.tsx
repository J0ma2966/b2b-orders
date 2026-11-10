"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { PrivacyNote } from "@/components/forms/privacy-note";
import { AccountFields, type PhoneConfirmChannels } from "@/components/forms/account-fields";
import { SupplierFields } from "@/components/forms/supplier-fields";
import type { TerritoryOption } from "@/components/territory/types";
import { initialFormState } from "@/lib/forms";
import { registerSupplierAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export function SupplierRegisterForm({ territories, loggedIn, confirm }: { territories: TerritoryOption[]; loggedIn: boolean; confirm: PhoneConfirmChannels }) {
  const t = useT();
  const [state, action, pending] = useActionState(registerSupplierAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-6">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {!loggedIn && <AccountFields state={state} confirm={confirm} />}
      <SupplierFields state={state} territories={territories} />
      <PrivacyNote />
      <SubmitButton className="w-full sm:w-auto" pendingText="Отправляем…">{t("Отправить заявку")}</SubmitButton>
    </ActionForm>
  );
}

"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { ProductFields } from "@/components/catalog/product-fields";
import { UnitRows } from "@/components/catalog/unit-rows";
import { initialFormState } from "@/lib/forms";
import { createProductAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export function NewProductForm({ categories }: { categories: { id: string; name: string }[] }) {
  const t = useT();
  const [state, action, pending] = useActionState(createProductAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-6">
      <FormMessage state={state} />
      <ProductFields state={state} categories={categories} />
      <fieldset>
        <legend className="mb-2 text-base font-semibold">{t("Единицы продажи и цены")}</legend>
        <UnitRows />
      </fieldset>
      <SubmitButton pendingText="Создаём…">{t("Создать товар")}</SubmitButton>
    </ActionForm>
  );
}

"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { SHOP_STATUS_LABEL } from "@/lib/statuses";
import { setShopStatusAction } from "../../actions";
import { useT } from "@/lib/i18n/client";

export function ShopStatusForm({ shopId, current }: { shopId: string; current: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(setShopStatusAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="shopId" value={shopId} />
      <Field label="Новый статус" name="status">
        <Select name="status" defaultValue={current}>
          {Object.entries(SHOP_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{t(l)}</option>
          ))}
        </Select>
      </Field>
      <Field label="Причина" name="reason" error={state.fieldErrors?.reason}>
        <Input name="reason" required />
      </Field>
      <SubmitButton variant="secondary">{t("Изменить статус")}</SubmitButton>
    </ActionForm>
  );
}

"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState, useState } from "react";
import { Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { SUPPLIER_ACTION_LABEL, SUPPLIER_ACTION_NEEDS_COMMENT, type SupplierModerationAction } from "@/lib/statuses";
import { moderateSupplierAction, setSupplierCommissionAction } from "../../actions";
import { useT } from "@/lib/i18n/client";

export function ModerationForm({
  supplierId,
  actions,
  currentComment,
}: {
  supplierId: string;
  actions: SupplierModerationAction[];
  currentComment: string | null;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState(moderateSupplierAction, initialFormState);
  const [picked, setPicked] = useState<SupplierModerationAction>(actions[0]);
  // После смены статуса список действий меняется — выбранное может стать недоступным
  const action = actions.includes(picked) ? picked : actions[0];
  const setAction = setPicked;
  const needsComment = SUPPLIER_ACTION_NEEDS_COMMENT.includes(action);
  const danger = action === "block" || action === "reject";
  return (
    <ActionForm action={formAction} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      {currentComment && <p className="text-xs text-gray-500">{t("Последний комментарий:")}{" "}{currentComment}</p>}
      <input type="hidden" name="supplierId" value={supplierId} />
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <label key={a} className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm ring-1 ${a === action ? "bg-brand-50 ring-brand-500" : "ring-gray-300"}`}>
            <input type="radio" name="action" value={a} checked={a === action} onChange={() => setAction(a)} className="sr-only" />
            {t(SUPPLIER_ACTION_LABEL[a])}
          </label>
        ))}
      </div>
      <Field label={needsComment ? "Комментарий для поставщика" : "Комментарий (необязательно)"} name="comment" error={state.fieldErrors?.comment}>
        <Textarea name="comment" required={needsComment} />
      </Field>
      <SubmitButton
        variant={danger ? "danger" : "primary"}
        confirm={danger ? `${SUPPLIER_ACTION_LABEL[action]} поставщика?` : undefined}
      >
        {t(SUPPLIER_ACTION_LABEL[action])}
      </SubmitButton>
    </ActionForm>
  );
}

export function CommissionForm({ supplierId, current, defaultRate }: { supplierId: string; current: string; defaultRate: string }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(setSupplierCommissionAction, initialFormState);
  return (
    <ActionForm action={formAction} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="supplierId" value={supplierId} />
      <Field label="Индивидуальная ставка, %" name="commissionRate" error={state.fieldErrors?.commissionRate} hint={`Пусто — стандартная ставка (${defaultRate}%)`}>
        <Input name="commissionRate" inputMode="decimal" defaultValue={current} />
      </Field>
      <SubmitButton variant="secondary">{t("Сохранить")}</SubmitButton>
    </ActionForm>
  );
}

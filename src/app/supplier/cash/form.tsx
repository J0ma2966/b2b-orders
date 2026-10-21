"use client";

import { useActionState, useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Field, Input } from "@/components/ui";
import { initialFormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";
import { acceptHandoverAction } from "./actions";

export function HandoverForm({ courierId, onHand }: { courierId: string; onHand: number }) {
  const t = useT();
  const [state, action, pending] = useActionState(acceptHandoverAction, initialFormState);
  const [amount, setAmount] = useState(String(onHand));
  const n = Number(amount.replace(/\s/g, "").replace(",", "."));
  const diff = Number.isFinite(n) ? Math.round((onHand - n) * 100) / 100 : 0;
  return (
    <ActionForm key={state.at} action={action} pending={pending} className="space-y-2">
      <FormMessage state={state} />
      <input type="hidden" name="courierId" value={courierId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Принято, сум" name="amount" error={state.fieldErrors?.amount}>
          <Input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Комментарий" name="comment">
          <Input name="comment" defaultValue={state.values?.comment} />
        </Field>
      </div>
      {diff !== 0 && (
        <p className={`text-sm ${diff > 0 ? "text-red-600" : "text-yellow-700"}`}>
          {diff > 0 ? t("Расхождение: не хватает {sum}", { sum: t.money(diff) }) : t("Расхождение: сдано больше на {sum}", { sum: t.money(-diff) })}
        </p>
      )}
      <SubmitButton pendingText="…">{t("Принял наличные")}</SubmitButton>
    </ActionForm>
  );
}

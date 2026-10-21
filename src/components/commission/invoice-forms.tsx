"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";
import { invoiceStatusAction, issueInvoicesAction } from "@/app/admin/actions";

export function IssueInvoicesForm() {
  const t = useT();
  const [state, action, pending] = useActionState(issueInvoicesAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-2">
      <FormMessage state={state} />
      <SubmitButton variant="secondary" pendingText="…">{t("Выставить счета за прошлый месяц")}</SubmitButton>
    </ActionForm>
  );
}

export function InvoiceStatusForm({ invoiceId }: { invoiceId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(invoiceStatusAction, initialFormState);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <ActionForm action={action} pending={pending} className="flex flex-wrap items-center justify-end gap-2">
      <FormMessage state={state} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <SubmitButton name="status" value="PAID" variant="secondary" className="min-h-0 py-1" pendingText="…">{t("Оплачен")}</SubmitButton>
      <SubmitButton name="status" value="CANCELLED" variant="ghost" className="min-h-0 py-1 text-red-600" pendingText="…" confirm="Аннулировать счёт?">{t("Аннулировать")}</SubmitButton>
    </ActionForm>
  );
}

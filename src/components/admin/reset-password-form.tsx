"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";
import { adminResetPasswordAction } from "@/app/admin/actions";

export function ResetPasswordForm({ userId }: { userId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(adminResetPasswordAction, initialFormState);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <ActionForm action={action} pending={pending} className="inline">
      <FormMessage state={state} />
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton variant="ghost" className="min-h-0 px-2 py-1 text-xs text-brand-600" pendingText="…" confirm="Сбросить пароль? Пользователь выйдет на всех устройствах.">
        {t("Сбросить пароль")}
      </SubmitButton>
    </ActionForm>
  );
}

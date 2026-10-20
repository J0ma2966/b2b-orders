"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { resolveAntifraudAction } from "./actions";

const BUTTONS = [
  ["confirm", "Подтвердить", "secondary"],
  ["reject", "Отклонить и вернуть цену", "secondary"],
  ["watch", "Под наблюдение", "secondary"],
  ["disable_orders", "Запретить новые заказы", "danger"],
  ["hide", "Скрыть поставщика", "danger"],
  ["block", "Заблокировать поставщика", "danger"],
] as const;

export function ResolveForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState(resolveAntifraudAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="mt-3 space-y-2 border-t border-gray-100 pt-3">
      <FormMessage state={state} />
      <input type="hidden" name="eventId" value={eventId} />
      <Input name="comment" placeholder="Комментарий (для блокировки обязателен)" aria-label="Комментарий" />
      <div className="flex flex-wrap gap-2">
        {BUTTONS.map(([value, label, variant]) => (
          <SubmitButton
            key={value}
            name="action"
            value={value}
            variant={variant}
            className="min-h-0 px-3 py-1.5 text-xs"
            confirm={variant === "danger" ? `${label}?` : undefined}
          >
            {label}
          </SubmitButton>
        ))}
      </div>
    </ActionForm>
  );
}

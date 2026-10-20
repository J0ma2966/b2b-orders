"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "./index";
import { useActionFormPending } from "./action-form";
import { useT } from "@/lib/i18n/client";

export function SubmitButton({
  children,
  pendingText = "Сохранение…",
  confirm,
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string; confirm?: string }) {
  const t = useT();
  const status = useFormStatus();
  const actionPending = useActionFormPending();
  const pending = status.pending || actionPending;
  return (
    <Button
      type="submit"
      disabled={pending || props.disabled}
      onClick={(e) => {
        // Подтверждение опасных действий (ТЗ п. 86)
        if (confirm && !window.confirm(t(confirm))) e.preventDefault();
      }}
      {...props}
    >
      {pending ? t(pendingText) : children}
    </Button>
  );
}

"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "./index";
import { useActionFormPending } from "./action-form";

export function SubmitButton({
  children,
  pendingText = "Сохранение…",
  confirm,
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string; confirm?: string }) {
  const status = useFormStatus();
  const actionPending = useActionFormPending();
  const pending = status.pending || actionPending;
  return (
    <Button
      type="submit"
      disabled={pending || props.disabled}
      onClick={(e) => {
        // Подтверждение опасных действий (ТЗ п. 86)
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      {...props}
    >
      {pending ? pendingText : children}
    </Button>
  );
}

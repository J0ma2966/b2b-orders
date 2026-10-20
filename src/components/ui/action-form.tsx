"use client";

import { createContext, startTransition, useContext, type ComponentProps } from "react";

const PendingContext = createContext(false);
export const useActionFormPending = () => useContext(PendingContext);

// Форма для useActionState без автоматического сброса полей после ответа сервера:
// при ошибке пользователь не теряет выбранные списки, файлы и точку на карте.
export function ActionForm({
  action,
  pending = false,
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & { action: (fd: FormData) => void; pending?: boolean }) {
  return (
    <PendingContext value={pending}>
      <form
        {...props}
        onSubmit={(e) => {
          e.preventDefault();
          // submitter — чтобы name/value нажатой кнопки попали в данные формы
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          const fd = new FormData(e.currentTarget, submitter);
          startTransition(() => action(fd));
        }}
      />
    </PendingContext>
  );
}

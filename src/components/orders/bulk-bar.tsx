"use client";

import { useActionState, useRef } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Select } from "@/components/ui";
import { initialFormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";
import { bulkOrderAction } from "@/app/supplier/orders/actions";

export const BULK_FORM = "bulk-orders";

// П3: действия для отмеченных в списке заказов. Галочки стоят в строках списка (form={BULK_FORM}).
export function BulkBar({ couriers }: { couriers: { id: string; name: string }[] }) {
  const t = useT();
  const [state, action, pending] = useActionState(bulkOrderAction, initialFormState);
  const ref = useRef<HTMLFormElement>(null);
  const boxes = () => [...document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM}"][name="ids[]"]`)];
  const open = (path: string) => {
    const ids = boxes().filter((b) => b.checked).map((b) => b.value);
    if (ids.length === 0) return alertNone();
    window.open(`${path}?ids=${ids.join(",")}`, "_blank");
  };
  const alertNone = () => ref.current?.querySelector<HTMLElement>("[data-hint]")?.classList.remove("hidden");
  return (
    <div className="mb-3 space-y-2">
      <FormMessage state={state} />
      <ActionForm ref={ref} id={BULK_FORM} action={action} pending={pending} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface p-2 text-sm ring-1 ring-gray-200">
        <label className="flex items-center gap-1.5 px-2">
          <input type="checkbox" className="size-4" onChange={(e) => boxes().forEach((b) => (b.checked = e.target.checked))} />
          {t("Все")}
        </label>
        <SubmitButton name="op" value="accept" variant="secondary" pendingText="…">{t("Принять")}</SubmitButton>
        <SubmitButton name="op" value="ready" variant="secondary" pendingText="…">{t("Готово")}</SubmitButton>
        {couriers.length > 0 && (
          <span className="flex items-center gap-1">
            <Select name="courierId" defaultValue="" className="min-h-0 w-auto py-1.5" aria-label={t("Доставщик")}>
              <option value="">{t("Доставщик…")}</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <SubmitButton name="op" value="assign" variant="secondary" pendingText="…">{t("Назначить")}</SubmitButton>
          </span>
        )}
        <button type="button" className="px-2 text-brand-600" onClick={() => open("/documents/supplier/shipping")}>{t("Печать накладных")}</button>
        <button type="button" className="px-2 text-brand-600" onClick={() => open("/documents/supplier/picking")}>{t("Лист сборки")}</button>
        <span data-hint className="hidden text-xs text-red-600">{t("Отметьте заказы в списке")}</span>
      </ActionForm>
    </div>
  );
}

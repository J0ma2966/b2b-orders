"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Select } from "@/components/ui";
import { initialFormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";
import { WEEKDAY_SHORT } from "@/lib/order-core";
import { updateTerritoryTermsAction } from "../actions";

export type TerritoryTermsRow = { territoryId: string; name: string; weekdays: number[]; courierId: string | null };

export function TerritoryTermsForm({ rows, couriers }: { rows: TerritoryTermsRow[]; couriers: { id: string; name: string }[] }) {
  const t = useT();
  const [state, action, pending] = useActionState(updateTerritoryTermsAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <FormMessage state={state} />
      <p className="text-sm text-gray-500">
        {t("Отметьте дни, когда возите в каждый район. Ничего не отмечено — доставка каждый день. Закреплённый доставщик предлагается первым, когда заказ готов.")}
      </p>
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => (
          <li key={r.territoryId} className="space-y-2 py-3">
            <div className="text-sm font-medium">{t(r.name)}</div>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_SHORT.map((label, i) => (
                <label key={label} className="flex cursor-pointer items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs has-checked:border-brand-600 has-checked:bg-brand-50">
                  <input type="checkbox" name={`wd_${r.territoryId}`} value={i + 1} defaultChecked={r.weekdays.includes(i + 1)} className="size-3.5" />
                  {t(label)}
                </label>
              ))}
            </div>
            {couriers.length > 0 && (
              <Select name={`courier_${r.territoryId}`} defaultValue={r.courierId ?? ""} className="max-w-xs" aria-label={t("Доставщик")}>
                <option value="">{t("Доставщик не закреплён")}</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            )}
          </li>
        ))}
      </ul>
      <SubmitButton>{t("Сохранить")}</SubmitButton>
    </ActionForm>
  );
}

"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { MapPicker } from "@/components/map/map-picker";
import { TerritorySelect } from "@/components/territory/territory-select";
import type { TerritoryOption } from "@/components/territory/types";
import { initialFormState } from "@/lib/forms";
import { updateShopProfileAction } from "../actions";

export function ShopProfileForm({ territories, defaults }: { territories: TerritoryOption[]; defaults: Record<string, string> }) {
  const [state, action, pending] = useActionState(updateShopProfileAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = { ...defaults, ...state.values };
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Название" name="name" error={e.name}>
        <Input name="name" defaultValue={v.name} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ИНН" name="inn" error={e.inn}>
          <Input name="inn" inputMode="numeric" defaultValue={v.inn} />
        </Field>
        <Field label="Контактное лицо" name="contactName" error={e.contactName}>
          <Input name="contactName" defaultValue={v.contactName} required />
        </Field>
        <Field label="Основной телефон" name="shopPhone" error={e.shopPhone}>
          <Input name="shopPhone" type="tel" inputMode="tel" defaultValue={v.shopPhone} required />
        </Field>
        <Field label="Запасной телефон" name="phone2" error={e.phone2}>
          <Input name="phone2" type="tel" inputMode="tel" defaultValue={v.phone2} />
        </Field>
      </div>
      <TerritorySelect territories={territories} defaultValue={v.territoryId} error={e.territoryId} />
      <Field label="Адрес" name="address" error={e.address}>
        <Input name="address" defaultValue={v.address} required />
      </Field>
      <MapPicker defaultValue={{ lat: Number(v.lat), lng: Number(v.lng) }} error={e.lat?.[0]} />
      <Field label="Добавить фото" name="photo" error={e.photo}>
        <Input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" />
      </Field>
      <SubmitButton>Сохранить</SubmitButton>
    </ActionForm>
  );
}

"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { AccountFields } from "@/components/forms/account-fields";
import { MapPicker } from "@/components/map/map-picker";
import { TerritorySelect } from "@/components/territory/territory-select";
import type { TerritoryOption } from "@/components/territory/types";
import { initialFormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";
import { registerShopAction } from "../actions";

export function ShopRegisterForm({ territories, loggedIn }: { territories: TerritoryOption[]; loggedIn: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState(registerShopAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const point = v.lat && v.lng ? { lat: Number(v.lat), lng: Number(v.lng) } : null;
  return (
    <ActionForm action={action} pending={pending} className="space-y-6">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {!loggedIn && <AccountFields state={state} />}
      <fieldset className="space-y-4">
        <legend className="mb-2 text-base font-semibold">{t("Магазин")}</legend>
        <Field label="Название магазина" name="name" error={e.name}>
          <Input name="name" defaultValue={v.name} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ИНН" name="inn" error={e.inn} hint="Необязательно">
            <Input name="inn" inputMode="numeric" defaultValue={v.inn} />
          </Field>
          <Field label="Контактное лицо" name="contactName" error={e.contactName} hint={loggedIn ? undefined : "По умолчанию — ваше ФИО"}>
            <Input name="contactName" defaultValue={v.contactName} />
          </Field>
          <Field label="Основной телефон магазина" name="shopPhone" error={e.shopPhone} hint={loggedIn ? undefined : "По умолчанию — телефон для входа"}>
            <Input name="shopPhone" type="tel" inputMode="tel" defaultValue={v.shopPhone} required={loggedIn} />
          </Field>
          <Field label="Запасной телефон" name="phone2" error={e.phone2}>
            <Input name="phone2" type="tel" inputMode="tel" defaultValue={v.phone2} />
          </Field>
        </div>
        <TerritorySelect territories={territories} defaultValue={v.territoryId} error={e.territoryId} />
        <Field label="Адрес" name="address" error={e.address}>
          <Input name="address" defaultValue={v.address} placeholder={t("Улица, дом, ориентир")} required />
        </Field>
        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">{t("Расположение на карте")}</span>

          <MapPicker defaultValue={point} error={e.lat?.[0]} />
        </div>
        <Field label="Фото магазина" name="photo" error={e.photo} hint="JPG, PNG или WEBP до 10 МБ">
          <Input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" />
        </Field>
      </fieldset>
      <SubmitButton className="w-full sm:w-auto" pendingText="Регистрируем…">{t("Зарегистрировать магазин")}</SubmitButton>
    </ActionForm>
  );
}

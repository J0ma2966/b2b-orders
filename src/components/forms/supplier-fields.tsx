"use client";

import { Field, Input, Textarea } from "@/components/ui";
import { MapPicker } from "@/components/map/map-picker";
import { TerritorySelect } from "@/components/territory/territory-select";
import { TerritoryMultiSelect } from "@/components/territory/territory-multi-select";
import type { TerritoryOption } from "@/components/territory/types";
import type { FormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";

export type SupplierDefaults = Partial<Record<string, string>> & { territoryIds?: string[] };

// Поля профиля поставщика: регистрация и редактирование (ТЗ п. 8–9).
export function SupplierFields({
  state,
  territories,
  defaults = {},
  showDeliveryTerritory = true,
  innReadOnly = false,
}: {
  state: FormState;
  territories: TerritoryOption[];
  defaults?: SupplierDefaults;
  showDeliveryTerritory?: boolean;
  innReadOnly?: boolean;
}) {
  const t = useT();
  const e = state.fieldErrors ?? {};
  const v = { ...defaults, ...state.values } as Record<string, string | undefined>;
  const office = v.officeLat && v.officeLng ? { lat: Number(v.officeLat), lng: Number(v.officeLng) } : null;
  return (
    <>
      <fieldset className="space-y-4">
        <legend className="mb-2 text-base font-semibold">{t("Компания")}</legend>
        <Field label="Название юридического лица" name="legalName" error={e.legalName}>
          <Input name="legalName" defaultValue={v.legalName} placeholder={t("ООО «Пример»")} required />
        </Field>
        <Field label="Название для магазинов" name="displayName" error={e.displayName} hint="Если пусто — как у юрлица">
          <Input name="displayName" defaultValue={v.displayName} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ИНН" name="inn" error={e.inn}>
            <Input name="inn" inputMode="numeric" defaultValue={v.inn} required={!innReadOnly} disabled={innReadOnly} />
          </Field>
          <Field label="Телефон компании" name="companyPhone" error={e.companyPhone}>
            <Input name="companyPhone" type="tel" inputMode="tel" defaultValue={v.companyPhone} required />
          </Field>
          <Field label="Email" name="email" error={e.email}>
            <Input name="email" type="email" defaultValue={v.email} required />
          </Field>
          <Field label="Сайт" name="website" error={e.website}>
            <Input name="website" defaultValue={v.website} />
          </Field>
        </div>
        <Field label="Юридический адрес" name="legalAddress" error={e.legalAddress}>
          <Input name="legalAddress" defaultValue={v.legalAddress} required />
        </Field>
        <Field label="Контактное лицо" name="contactPerson" error={e.contactPerson}>
          <Input name="contactPerson" defaultValue={v.contactPerson} />
        </Field>
        <Field label="Описание деятельности" name="description" error={e.description}>
          <Textarea name="description" defaultValue={v.description} />
        </Field>
        <Field label="Логотип" name="logo" error={e.logo} hint="JPG, PNG или WEBP до 10 МБ">
          <Input name="logo" type="file" accept="image/jpeg,image/png,image/webp" />
        </Field>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-2 text-base font-semibold">{t("Главный офис")}</legend>
        <TerritorySelect territories={territories} name="officeTerritoryId" defaultValue={v.officeTerritoryId} error={e.officeTerritoryId} />
        <Field label="Адрес офиса" name="officeAddress" error={e.officeAddress}>
          <Input name="officeAddress" defaultValue={v.officeAddress} required />
        </Field>
        <MapPicker latName="officeLat" lngName="officeLng" defaultValue={office} error={e.officeLat?.[0]} />
      </fieldset>
      {showDeliveryTerritory && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-base font-semibold">{t("Территория доставки")}</legend>
          <p className="text-sm text-gray-500">{t("Отметьте регионы целиком или отдельные города и районы. Магазины из этих мест увидят ваш каталог.")}</p>
          <TerritoryMultiSelect
            territories={territories}
            defaultValue={state.values?.["territoryIds[]"]?.split(",").filter(Boolean) ?? defaults.territoryIds}
          />
          {(e.territoryIds || e["territoryIds[]"]) && (
            <p className="text-xs text-red-600">{t((e.territoryIds ?? e["territoryIds[]"])?.[0])}</p>

          )}
        </fieldset>
      )}
    </>
  );
}

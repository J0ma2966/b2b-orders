"use client";

import { Field, Input, Select, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";
import { PhotoInput } from "@/components/ui/photo-input";

export type ProductDefaults = Partial<Record<"name" | "description" | "brand" | "sku" | "categoryId" | "weightKg" | "attributes", string>> & {
  isAvailable?: boolean;
  allowReplacement?: boolean;
};

// Карточка товара (ТЗ п. 14)
export function ProductFields({
  state,
  categories,
  defaults = {},
}: {
  state: FormState;
  categories: { id: string; name: string }[];
  defaults?: ProductDefaults;
}) {
  const t = useT();
  const e = state.fieldErrors ?? {};
  const v = { ...defaults, ...state.values } as Record<string, string | undefined>;
  return (
    <div className="space-y-4">
      <Field label="Название" name="name" error={e.name}>
        <Input name="name" defaultValue={v.name} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Категория" name="categoryId" error={e.categoryId}>
          <Select name="categoryId" defaultValue={v.categoryId ?? ""}>
            <option value="">{t("Без категории")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Бренд" name="brand" error={e.brand}>
          <Input name="brand" defaultValue={v.brand} />
        </Field>
        <Field label="Артикул" name="sku" error={e.sku}>
          <Input name="sku" defaultValue={v.sku} />
        </Field>
        <Field label="Вес, кг" name="weightKg" error={e.weightKg}>
          <Input name="weightKg" inputMode="decimal" defaultValue={v.weightKg} />
        </Field>
      </div>
      <Field label="Описание" name="description" error={e.description}>
        <Textarea name="description" defaultValue={v.description} />
      </Field>
      <Field label="Характеристики" name="attributes" hint="Каждая с новой строки: «Объём: 1 л»">
        <Textarea name="attributes" defaultValue={v.attributes} placeholder={"Объём: 1 л\nСтрана: Узбекистан"} />
      </Field>
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isAvailable" defaultChecked={defaults.isAvailable ?? true} className="size-4" />
          {t("Доступен для заказа")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allowReplacement" defaultChecked={defaults.allowReplacement ?? true} className="size-4" />
          {t("Можно заменить по заявке")}
        </label>
      </div>
      <PhotoInput name="photos" label="Фотографии" error={e.photos} hint="До 8 фото, JPG/PNG/WEBP до 10 МБ каждое" max={8} />
    </div>
  );
}

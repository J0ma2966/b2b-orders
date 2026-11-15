"use client";

import { Field, Input, Select, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useT } from "@/lib/i18n/client";
import { PRODUCT_PHOTO_BYTES } from "@/lib/image-compress";
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
        <div data-testid="sku-readonly">
          <div className="mb-1 block text-sm font-medium text-gray-700">{t("Артикул")}</div>
          <div className="flex min-h-11 items-center rounded-xl bg-gray-100 px-3 py-2.5 text-base text-gray-700 sm:text-sm">
            {defaults.sku ? <span className="font-medium tabular-nums">{defaults.sku}</span> : <span className="text-gray-500">{t("Присвоится автоматически")}</span>}
          </div>
        </div>
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
      <PhotoInput name="photos" label="Фотографии" error={e.photos} hint="До 8 фото, JPG/PNG/WEBP. Большие фото сжимаются до 1 МБ автоматически" max={8} compressTo={PRODUCT_PHOTO_BYTES} />
    </div>
  );
}

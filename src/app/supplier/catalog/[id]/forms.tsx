"use client";

import { useActionState, useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { ProductFields, type ProductDefaults } from "@/components/catalog/product-fields";
import { UnitRows } from "@/components/catalog/unit-rows";
import { formatQty } from "@/lib/catalog";
import { initialFormState } from "@/lib/forms";
import { fileUrl } from "@/lib/storage-url";
import { saveUnitsAction, stockOperationAction, updateProductAction } from "../actions";

export function EditProductForm({
  productId,
  categories,
  photos,
  defaults,
}: {
  productId: string;
  categories: { id: string; name: string }[];
  photos: string[];
  defaults: ProductDefaults;
}) {
  const [state, action, pending] = useActionState(updateProductAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="productId" value={productId} />
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <label key={p} className="relative block">
              <img src={fileUrl(p)!} alt="" className="size-20 rounded-lg object-cover ring-1 ring-gray-200" />
              <span className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                <input type="checkbox" name="removePhoto" value={p} /> убрать
              </span>
            </label>
          ))}
        </div>
      )}
      <ProductFields state={state} categories={categories} defaults={defaults} />
      <SubmitButton>Сохранить карточку</SubmitButton>
    </ActionForm>
  );
}

type UnitView = { id: string; label: string; price: string; isActive: boolean; physical: number; reserved: number };

export function UnitsForm({ productId, units }: { productId: string; units: UnitView[] }) {
  const [state, action, pending] = useActionState(saveUnitsAction, initialFormState);
  return (
    <ActionForm key={state.at ?? "u"} action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="productId" value={productId} />
      {units.map((u) => (
        <div key={u.id} className="rounded-lg ring-1 ring-gray-200 p-3">
          <input type="hidden" name="existingId" value={u.id} />
          <div className="flex items-center justify-between gap-2">
            <b className="text-sm">{u.label}</b>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" name={`active_${u.id}`} defaultChecked={u.isActive} /> продаётся
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 items-end gap-2">
            <Field label="Цена, сум">
              <Input name="existingPrice" inputMode="decimal" defaultValue={u.price} placeholder="без цены" />
            </Field>
            <div className="text-xs text-gray-600">
              <div>Доступно: <b>{formatQty(u.physical - u.reserved)}</b></div>
              <div>Физический {formatQty(u.physical)} · резерв {formatQty(u.reserved)}</div>
            </div>
          </div>
        </div>
      ))}
      <details>
        <summary className="cursor-pointer text-sm text-brand-600">Добавить единицу продажи</summary>
        <div className="mt-2">
          <UnitRows initial={0} />
        </div>
      </details>
      <SubmitButton>Сохранить цены</SubmitButton>
    </ActionForm>
  );
}

const OPS = [
  ["INCOME", "Приход"],
  ["WRITE_OFF", "Списание"],
  ["ADJUSTMENT", "Корректировка ±"],
] as const;

export function StockForm({ units }: { units: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(stockOperationAction, initialFormState);
  const [type, setType] = useState<string>("INCOME");
  return (
    <ActionForm key={state.at ?? "s"} action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Единица" name="unitId">
          <Select name="unitId">
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Операция" name="type">
          <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {OPS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Количество" name="qty" error={state.fieldErrors?.qty} hint={type === "ADJUSTMENT" ? "Со знаком: -3 или 5" : undefined}>
        <Input name="qty" inputMode="decimal" required />
      </Field>
      <Field label={type === "INCOME" ? "Основание (необязательно)" : "Основание"} name="reason" error={state.fieldErrors?.reason}>
        <Input name="reason" placeholder={type === "INCOME" ? "Накладная №…" : "Причина"} required={type !== "INCOME"} />
      </Field>
      <SubmitButton variant="secondary">Провести</SubmitButton>
    </ActionForm>
  );
}

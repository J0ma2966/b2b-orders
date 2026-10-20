"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { createBonusAction } from "./actions";

export function BonusForm({ units, today }: { units: { id: string; label: string }[]; today: string }) {
  const [state, action, pending] = useActionState(createBonusAction, initialFormState);
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  const unitOptions = (
    <>
      <option value="">— выберите —</option>
      {units.map((u) => (
        <option key={u.id} value={u.id}>{u.label}</option>
      ))}
    </>
  );
  return (
    <ActionForm key={state.at ?? "b"} action={action} pending={pending} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Название акции" name="name" error={fe.name}>
        <Input name="name" defaultValue={v.name} placeholder="10 + 1 на воду" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="При покупке товара" name="triggerUnitId" error={fe.triggerUnitId}>
            <Select name="triggerUnitId" defaultValue={v.triggerUnitId ?? ""}>{unitOptions}</Select>
          </Field>
        </div>
        <Field label="Количество" name="triggerQty" error={fe.triggerQty}>
          <Input name="triggerQty" inputMode="decimal" defaultValue={v.triggerQty ?? "10"} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="Подарок" name="giftUnitId" error={fe.giftUnitId}>
            <Select name="giftUnitId" defaultValue={v.giftUnitId ?? ""}>{unitOptions}</Select>
          </Field>
        </div>
        <Field label="Количество подарка" name="giftQty" error={fe.giftQty}>
          <Input name="giftQty" inputMode="decimal" defaultValue={v.giftQty ?? "1"} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="repeatable" defaultChecked={v.repeatable ? v.repeatable === "on" : true} />
        За каждые N штук (20 шт. — 2 подарка). Без отметки — один подарок на заказ.
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Действует с" name="startsAt" error={fe.startsAt}>
          <Input name="startsAt" type="date" defaultValue={v.startsAt ?? today} />
        </Field>
        <Field label="по" name="endsAt" error={fe.endsAt}>
          <Input name="endsAt" type="date" defaultValue={v.endsAt} />
        </Field>
      </div>
      <SubmitButton>Создать акцию</SubmitButton>
    </ActionForm>
  );
}

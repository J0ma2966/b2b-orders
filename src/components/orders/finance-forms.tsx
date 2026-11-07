"use client";

import { useActionState, useEffect, useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { debtPaymentAction, setCreditAction } from "@/app/supplier/shops/actions";
import { useT } from "@/lib/i18n/client";
import { useSheet } from "@/components/ui/sheet";
import { showToast } from "@/components/ui/toast";
import { debtTone } from "@/lib/finance-core";

export function CreditForm({ shopId, creditAllowed, creditLimit, paymentTermDays = "" }: { shopId: string; creditAllowed: boolean; creditLimit: string; paymentTermDays?: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(setCreditAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="shopId" value={shopId} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="creditAllowed" defaultChecked={creditAllowed} /> {t("Разрешить работу в долг")}
      </label>
      <Field label="Лимит задолженности, сум" name="creditLimit" error={state.fieldErrors?.creditLimit} hint="Пусто — без лимита">
        <Input name="creditLimit" inputMode="decimal" defaultValue={state.values?.creditLimit ?? creditLimit} />
      </Field>
      <Field label="Отсрочка оплаты, дней" name="paymentTermDays" error={state.fieldErrors?.paymentTermDays} hint="Пусто — без срока. При просрочке новые заказы только с полной оплатой">
        <Input name="paymentTermDays" type="number" min={1} max={365} defaultValue={state.values?.paymentTermDays ?? paymentTermDays} />
      </Field>
      <SubmitButton variant="secondary">{t("Сохранить")}</SubmitButton>
    </ActionForm>
  );
}

// Погашение долга магазина (приложение поставщика: шторка «Принять оплату»).
// balance — текущий счёт магазина: под суммой сразу видно, каким он станет (красный/жёлтый → зелёный при переплате).
// Оплата гасит сначала самый старый долг, поэтому просрочка уходит, когда оплачено не меньше просроченной суммы.
export function DebtPaymentForm({ shopId, today, balance, overdueAmount = 0 }: { shopId: string; today: string; balance?: number; overdueAmount?: number }) {
  const t = useT();
  const sheet = useSheet();
  const [state, action, pending] = useActionState(debtPaymentAction, initialFormState);
  const fe = state.fieldErrors ?? {};
  const [amount, setAmount] = useState(state.values?.amount ?? "");
  const [method, setMethod] = useState(state.values?.method ?? "CASH");
  // После успешной оплаты поле суммы очищается (обновление состояния при рендере, а не в эффекте)
  const [doneAt, setDoneAt] = useState(state.at);
  if (state.ok && state.at !== doneAt) {
    setDoneAt(state.at);
    setAmount("");
  }
  useEffect(() => {
    if (!state.ok || !state.message) return;
    showToast({ title: t(state.message), tone: "success" });
    sheet?.close();
    // sheet и t не меняются между ответами сервера
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);
  const value = Number(amount.replace(/\D/g, "")) || 0;
  const after = balance === undefined ? null : balance - value;
  const tone = after === null ? null : debtTone(after, Math.max(0, overdueAmount - value));
  const quick = [...(balance && balance > 0 ? [balance] : []), 1_000_000, 5_000_000].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <ActionForm action={action} pending={pending} className="space-y-3.5">
      {state.error && <FormMessage state={state} />}
      <input type="hidden" name="shopId" value={shopId} />
      <label className="block">
        <span className="sr-only">{t("Сумма")}</span>
        <span className="flex items-baseline gap-2 rounded-2xl px-4 py-3 ring-2 ring-brand-500 focus-within:shadow-[0_0_0_5px_var(--color-brand-100)]">
          <input
            name="amount"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(groupDigits(e.target.value))}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[1.625rem] font-bold tabular-nums outline-none placeholder:text-gray-300 focus-visible:outline-none"
          />
          <span className="text-sm font-semibold text-gray-500">{t("сум")}</span>
        </span>
        {fe.amount && <span className="mt-1 block text-xs text-red-600" role="alert">{t(fe.amount[0])}</span>}
      </label>
      <div className="flex flex-wrap gap-2">
        {quick.map((v, i) => (
          <button key={v} type="button" onClick={() => setAmount(groupDigits(String(Math.round(v))))} className="rounded-xl bg-brand-50 px-3 py-1.5 text-[13px] font-semibold text-brand-700">
            {i === 0 && balance && balance > 0 ? `${t("Весь долг")} · ` : ""}{groupDigits(String(Math.round(v)))}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("Способ")}>
        {(["CASH", "CARD", "TRANSFER"] as const).map((m) => (
          <label key={m} className={`flex cursor-pointer items-center justify-center rounded-xl px-2 py-2.5 text-[13px] font-semibold ring-[1.5px] ${method === m ? "bg-brand-50 text-brand-700 ring-brand-500" : "text-gray-600 ring-gray-200"}`}>
            <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
            {t(METHOD_LABEL[m])}
          </label>
        ))}
      </div>
      {after !== null && tone && (
        <div className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors duration-300 ${value ? AFTER_TONE[tone] : AFTER_TONE.none}`} data-testid="payment-after" data-tone={value ? tone : undefined}>
          <span className="whitespace-nowrap">{t("После оплаты")}</span>
          <b className="text-right text-[15px] tabular-nums">
            {!value ? "—" : after < 0 ? `${t("Переплата")} ${t.money(-after)}` : after > 0 ? `${t("Долг")} ${t.money(after)}` : t("Долга нет")}
          </b>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Дата" name="date" error={fe.date}>
          <Input name="date" type="date" defaultValue={state.values?.date ?? today} />
        </Field>
        <Field label="Комментарий" name="comment">
          <Input name="comment" defaultValue={state.values?.comment} />
        </Field>
      </div>
      <SubmitButton className="w-full py-3.5 text-[15px]">{t("Подтвердить оплату")}</SubmitButton>
    </ActionForm>
  );
}

const METHOD_LABEL = { CASH: "Наличные", CARD: "Карта", TRANSFER: "Безналичный" } as const;
const AFTER_TONE = {
  overdue: "bg-red-50 text-red-700",
  due: "bg-amber-50 text-amber-700",
  prepay: "bg-emerald-50 text-emerald-700",
  none: "bg-gray-100 text-gray-600",
} as const;

// «5000000» → «5 000 000» (только цифры, сервер принимает пробелы)
function groupDigits(v: string) {
  const d = v.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 13);
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

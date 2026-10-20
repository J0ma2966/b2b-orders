"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { formatMoney } from "@/lib/format";
import { distributePayment } from "@/lib/finance-core";
import { confirmDeliveryAction, problemAction, startDeliveryAction } from "@/app/courier/actions";
import { QrScanner } from "./qr-scanner";

export function StartDeliveryForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(startDeliveryAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-2">
      <FormMessage state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <SubmitButton className="w-full" pendingText="…">🚚 Выехал к магазину</SubmitButton>
    </ActionForm>
  );
}

export function ProblemForm({ orderId, allowNotDelivered }: { orderId: string; allowNotDelivered: boolean }) {
  const [state, action, pending] = useActionState(problemAction, initialFormState);
  const [open, setOpen] = useState(false);
  if (state.ok) return <FormMessage state={state} />;
  if (!open) {
    return (
      <button type="button" className="text-sm text-red-600 underline" onClick={() => setOpen(true)}>
        Проблема с доставкой
      </button>
    );
  }
  return (
    <ActionForm action={action} pending={pending} className="space-y-3 rounded-lg bg-red-50 p-3">
      <FormMessage state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Что случилось" name="note" error={state.fieldErrors?.note}>
        <Textarea name="note" defaultValue={state.values?.note} placeholder="Например: магазин закрыт, не отвечают по телефону" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="secondary" name="kind" value="problem" pendingText="…">Сообщить поставщику</SubmitButton>
        {allowNotDelivered && (
          <SubmitButton variant="danger" name="kind" value="not_delivered" pendingText="…" confirm="Отметить заказ как недоставленный? Товар вернётся на склад.">
            Не доставлен
          </SubmitButton>
        )}
      </div>
    </ActionForm>
  );
}

export type AcceptItem = { id: string; name: string; unitLabel: string; kind: "REGULAR" | "FORCED" | "BONUS"; qty: number; price: number; step: string };

export function AcceptanceForm({ orderId, items, balanceBefore }: { orderId: string; items: AcceptItem[]; balanceBefore: number }) {
  const [state, action, pending] = useActionState(confirmDeliveryAction, initialFormState);
  const [accepted, setAccepted] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.id, i.qty])));
  const [received, setReceived] = useState<string>("");
  const [qr, setQr] = useState("");
  const [scanning, setScanning] = useState(false);
  const onScan = useCallback((text: string) => {
    setQr(text);
    setScanning(false);
  }, []);

  const total = useMemo(
    () => Math.round(items.reduce((s, i) => s + (i.kind === "BONUS" ? 0 : i.price * (accepted[i.id] ?? 0)), 0) * 100) / 100,
    [items, accepted],
  );
  const toCollect = Math.max(0, total + balanceBefore);
  const receivedNum = received === "" ? NaN : Number(received.replace(/\s/g, "").replace(",", "."));
  const dist = Number.isFinite(receivedNum) ? distributePayment(total, receivedNum, balanceBefore) : null;

  if (state.ok) return <FormMessage state={state} />;
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <div className="space-y-3">
        {items.map((i) => (
          <div key={i.id} className="rounded-lg p-3 ring-1 ring-gray-200">
            <input type="hidden" name="itemId" value={i.id} />
            <div className="text-sm font-medium">
              {i.name} <span className="text-gray-500">· заказано {i.qty} {i.unitLabel}{i.kind === "BONUS" ? " · бонус" : i.kind === "FORCED" ? " · принуд. продажа" : ""}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Доставлено" name={`delivered_${i.id}`}>
                <Input name={`delivered_${i.id}`} type="number" inputMode="decimal" min="0" max={i.qty} step={i.step} defaultValue={state.values?.[`delivered_${i.id}`] ?? String(i.qty)} />
              </Field>
              <Field label="Принято" name={`accepted_${i.id}`}>
                <Input
                  name={`accepted_${i.id}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={i.qty}
                  step={i.step}
                  defaultValue={state.values?.[`accepted_${i.id}`] ?? String(i.qty)}
                  onChange={(e) => setAccepted((a) => ({ ...a, [i.id]: Number(e.target.value) || 0 }))}
                />
              </Field>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-gray-50 p-3 text-sm">
        <div className="flex justify-between"><span>Сумма по принятому</span><b>{formatMoney(total)}</b></div>
        {balanceBefore > 0 && <div className="flex justify-between"><span>Прежний долг магазина</span><b>{formatMoney(balanceBefore)}</b></div>}
        {balanceBefore < 0 && <div className="flex justify-between"><span>Переплата магазина</span><b>{formatMoney(-balanceBefore)}</b></div>}
        <div className="mt-1 flex justify-between text-base"><span>Всего к получению</span><b>{formatMoney(toCollect)}</b></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Получено, сум" name="received">
          <Input name="received" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={String(total)} required />
        </Field>
        <Field label="Способ оплаты" name="method">
          <Select name="method" defaultValue={state.values?.method ?? "CASH"}>
            <option value="CASH">Наличные</option>
            <option value="CARD">Карта</option>
            <option value="TRANSFER">Безналичный</option>
          </Select>
        </Field>
      </div>
      {dist && (
        <p className="text-xs text-gray-600">
          В оплату заказа {formatMoney(dist.toOrder)}
          {dist.toDebt > 0 && `, погашение долга ${formatMoney(dist.toDebt)}`}
          {dist.overpaid > 0 && `, переплата ${formatMoney(dist.overpaid)}`}
          {dist.orderDebt > 0 && `, долг по заказу ${formatMoney(dist.orderDebt)}`}
        </p>
      )}
      <div className="space-y-2">
        <Field label="QR магазина" name="qr" hint="Магазин нажимает «Подтвердить получение» и показывает QR">
          <Input name="qr" value={qr} onChange={(e) => setQr(e.target.value)} placeholder="Код под QR" autoComplete="off" />
        </Field>
        {scanning ? <QrScanner onScan={onScan} onClose={() => setScanning(false)} /> : <Button type="button" variant="secondary" onClick={() => setScanning(true)}>📷 Сканировать QR</Button>}
      </div>
      <SubmitButton className="w-full" pendingText="Подтверждаю…">Подтвердить получение</SubmitButton>
    </ActionForm>
  );
}

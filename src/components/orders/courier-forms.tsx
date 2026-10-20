"use client";

import { useActionState, useCallback, useMemo, useState, type ReactNode } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { initialFormState } from "@/lib/forms";
import { distributePayment } from "@/lib/finance-core";
import { confirmDeliveryAction, problemAction, startDeliveryAction } from "@/app/courier/actions";
import { QrScanner } from "./qr-scanner";
import { useT } from "@/lib/i18n/client";

export function StartDeliveryForm({ orderId }: { orderId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(startDeliveryAction, initialFormState);
  return (
    <ActionForm action={action} pending={pending} className="space-y-2">
      <FormMessage state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <SubmitButton className="min-h-14 w-full rounded-xl text-lg font-bold" pendingText="…">{t("🚚 Выехал к магазину")}</SubmitButton>
    </ActionForm>
  );
}

export function ProblemForm({ orderId, allowNotDelivered }: { orderId: string; allowNotDelivered: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState(problemAction, initialFormState);
  const [open, setOpen] = useState(false);
  if (state.ok) return <FormMessage state={state} />;
  if (!open) {
    return (
      <button type="button" className="min-h-12 w-full rounded-xl text-sm font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50" onClick={() => setOpen(true)}>
        {t("Проблема с доставкой")}
      </button>
    );
  }
  return (
    <ActionForm action={action} pending={pending} className="space-y-3 rounded-xl bg-red-50 p-4">
      <FormMessage state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Что случилось" name="note" error={state.fieldErrors?.note}>
        <Textarea name="note" defaultValue={state.values?.note} placeholder={t("Например: магазин закрыт, не отвечают по телефону")} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="secondary" name="kind" value="problem" pendingText="…">{t("Сообщить поставщику")}</SubmitButton>
        {allowNotDelivered && (
          <SubmitButton variant="danger" name="kind" value="not_delivered" pendingText="…" confirm="Отметить заказ как недоставленный? Товар вернётся на склад.">
            {t("Не доставлен")}
          </SubmitButton>
        )}
      </div>
    </ActionForm>
  );
}

export type AcceptItem = { id: string; name: string; unitLabel: string; kind: "REGULAR" | "FORCED" | "BONUS"; qty: number; price: number; step: string };

export function AcceptanceForm({ orderId, items, balanceBefore }: { orderId: string; items: AcceptItem[]; balanceBefore: number }) {
  const t = useT();
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

      <Step n={1} title={t("Проверьте товар")}>
        <p className="mb-3 text-sm text-gray-500">{t("Если магазин принял не всё, исправьте количество в поле «Принято».")}</p>
        <div className="space-y-2">
          {items.map((i) => (
            <div key={i.id} className="rounded-xl bg-gray-50 p-3">
              <input type="hidden" name="itemId" value={i.id} />
              <div className="font-medium">
                {i.name}
                {i.kind !== "REGULAR" && <span className="ml-1 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800">{i.kind === "BONUS" ? t("бонус") : t("принуд. продажа")}</span>}
              </div>
              <div className="text-sm text-gray-500">{t("заказано {qty} {unit}", { qty: i.qty, unit: t(i.unitLabel) })}</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="Доставлено" name={`delivered_${i.id}`}>
                  <Input className="text-lg font-semibold" name={`delivered_${i.id}`} type="number" inputMode="decimal" min="0" max={i.qty} step={i.step} defaultValue={state.values?.[`delivered_${i.id}`] ?? String(i.qty)} />
                </Field>
                <Field label="Принято" name={`accepted_${i.id}`}>
                  <Input
                    className="text-lg font-semibold"
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
      </Step>

      <Step n={2} title={t("Получите оплату")}>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">{t("Сумма по принятому")}</span><b className="tabular-nums">{t.money(total)}</b></div>
          {balanceBefore > 0 && <div className="flex justify-between"><span className="text-gray-500">{t("Прежний долг магазина")}</span><b className="tabular-nums">{t.money(balanceBefore)}</b></div>}
          {balanceBefore < 0 && <div className="flex justify-between"><span className="text-gray-500">{t("Переплата магазина")}</span><b className="tabular-nums">{t.money(-balanceBefore)}</b></div>}
        </div>
        <div className="mt-3 flex items-baseline justify-between rounded-xl bg-brand-50 px-4 py-3">
          <span className="font-medium">{t("Всего к получению")}</span>
          <span className="text-2xl font-bold text-brand-700 tabular-nums">{t.money(toCollect)}</span>
        </div>
        <div className="mt-3 space-y-3">
          <Field label="Получено, сум" name="received">
            <Input className="text-xl font-bold" name="received" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={String(total)} required />
          </Field>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-gray-700">{t("Способ оплаты")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {(["CASH", "CARD", "TRANSFER"] as const).map((m) => (
                <label key={m} className="cursor-pointer">
                  <input type="radio" name="method" value={m} defaultChecked={(state.values?.method ?? "CASH") === m} className="peer sr-only" />
                  <span className="flex min-h-12 items-center justify-center rounded-xl bg-gray-100 px-2 text-center text-sm font-semibold peer-checked:bg-brand-600 peer-checked:text-on-brand peer-focus-visible:outline-2 peer-focus-visible:outline-brand-500">
                    {t(METHOD_LABEL[m])}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {dist && (
            <p className="text-sm text-gray-500">
              {t("В оплату заказа {sum}", { sum: t.money(dist.toOrder) })}
              {dist.toDebt > 0 && `, ${t("погашение долга {sum}", { sum: t.money(dist.toDebt) })}`}
              {dist.overpaid > 0 && `, ${t("переплата {sum}", { sum: t.money(dist.overpaid) })}`}
              {dist.orderDebt > 0 && `, ${t("долг по заказу {sum}", { sum: t.money(dist.orderDebt) })}`}
            </p>
          )}
        </div>
      </Step>

      <Step n={3} title={t("Отсканируйте QR магазина")}>
        <p className="mb-3 text-sm text-gray-500">{t("Магазин нажимает «Подтвердить получение» и показывает QR")}</p>
        {scanning ? (
          <QrScanner onScan={onScan} onClose={() => setScanning(false)} />
        ) : (
          <Button type="button" variant="secondary" className="min-h-14 w-full rounded-xl text-base font-bold" onClick={() => setScanning(true)}>
            {t("📷 Сканировать QR")}
          </Button>
        )}
        <div className="mt-3">
          <Field label="QR магазина" name="qr" hint="Или введите код, который написан под QR">
            <Input className="text-center font-mono text-lg tracking-widest uppercase" name="qr" value={qr} onChange={(e) => setQr(e.target.value)} placeholder={t("Код под QR")} autoComplete="off" />
          </Field>
        </div>
      </Step>

      <SubmitButton className="min-h-14 w-full rounded-xl text-lg font-bold" pendingText="Подтверждаю…">{t("Подтвердить получение")}</SubmitButton>
    </ActionForm>
  );
}

const METHOD_LABEL = { CASH: "Наличные", CARD: "Карта", TRANSFER: "Безналичный" } as const;

// Шаг приёмки: доставщик идёт по ним сверху вниз
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-gray-200">
      <h2 className="mb-3 flex items-center gap-2.5 text-lg font-bold">
        <span className="grid size-7 place-items-center rounded-full bg-brand-600 text-sm text-on-brand" aria-hidden>{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

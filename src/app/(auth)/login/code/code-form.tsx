"use client";

import { useActionState, useEffect, useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Button, Field, Input, cn } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { useT } from "@/lib/i18n/client";
import { formatPhone } from "@/lib/phone";
import { requestCodeAction, verifyCodeAction, type CodeFormState } from "./actions";

type Props = { telegram: "bot" | "gateway" | null; sms: boolean; reset: boolean };

const RESEND_SEC = 60;

export function CodeLoginForm({ telegram, sms, reset }: Props) {
  const t = useT();
  const [sendState, send, sending] = useActionState(requestCodeAction, { step: "phone" } as CodeFormState);
  const [verifyState, verify, verifying] = useActionState(verifyCodeAction, { step: "code" } as CodeFormState);
  // «Изменить номер» возвращает к первому шагу до следующей отправки кода
  const [editedFor, setEditedFor] = useState<number | null>(null);
  const editing = editedFor !== null && editedFor === sendState.sentAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = sendState.sentAt ? Math.max(0, RESEND_SEC - Math.floor((Math.max(now, sendState.sentAt) - sendState.sentAt) / 1000)) : 0;

  const defaultChannel = telegram ? "TELEGRAM" : "SMS";
  const [channel, setChannel] = useState<"TELEGRAM" | "SMS">(sendState.channel ?? defaultChannel);

  if (sendState.step === "phone" || editing || !sendState.phone) {
    return (
      <ActionForm action={send} pending={sending} className="space-y-4">
        {sendState.error && <Alert tone="error">{t(sendState.error, sendState.errorParams)}</Alert>}
        <Field label="Телефон" name="phone">
          <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+998 90 123-45-67" defaultValue={sendState.phone ? formatPhone(sendState.phone) : ""} required />
        </Field>
        {telegram && sms ? (
          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-gray-700">{t("Куда прислать код")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["TELEGRAM", "SMS"] as const).map((c) => (
                <label
                  key={c}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ring-1",
                    channel === c ? "bg-brand-50 text-brand-700 ring-brand-500" : "ring-gray-300",
                  )}
                >
                  <input type="radio" name="channel" value={c} checked={channel === c} onChange={() => setChannel(c)} className="sr-only" />
                  {c === "TELEGRAM" ? "Telegram" : "SMS"}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <input type="hidden" name="channel" value={defaultChannel} />
        )}
        <SubmitButton className="w-full" pendingText="Отправляем…">{t("Получить код")}</SubmitButton>
      </ActionForm>
    );
  }

  const viaBot = sendState.channel === "TELEGRAM" && !!sendState.botUrl;
  const error = verifyState.error ?? sendState.error;
  return (
    <div className="space-y-4">
      <Alert tone="info">
        {viaBot
          ? t("Код придёт от бота в Telegram. Если вы ещё не подключали бота — откройте его и нажмите «Поделиться номером».")
          : sendState.channel === "SMS"
            ? t("Если номер {phone} зарегистрирован, на него отправлено SMS с кодом.", { phone: formatPhone(sendState.phone) })
            : t("Если номер {phone} зарегистрирован, код придёт в Telegram от аккаунта «Verification Codes».", { phone: formatPhone(sendState.phone) })}
      </Alert>
      {viaBot && (
        <a
          href={sendState.botUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 w-full items-center justify-center rounded-xl bg-[#229ED9] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1c8cc2]"
        >
          {t("Открыть бота в Telegram")}
        </a>
      )}
      <ActionForm action={verify} pending={verifying} className="space-y-4">
        {error && <Alert tone="error">{t(error, verifyState.error ? undefined : sendState.errorParams)}</Alert>}
        <input type="hidden" name="phone" value={sendState.phone} />
        {reset && <input type="hidden" name="reset" value="1" />}
        <Field label="Код" name="code" hint={t("Код для {phone}", { phone: formatPhone(sendState.phone) })}>
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} placeholder="000000" className="text-center text-lg tracking-[0.4em]" autoFocus required />
        </Field>
        <SubmitButton className="w-full" pendingText="Проверяем…">{t("Войти")}</SubmitButton>
      </ActionForm>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <ActionForm action={send} pending={sending}>
          <input type="hidden" name="phone" value={sendState.phone} />
          <input type="hidden" name="channel" value={sendState.channel} />
          <button type="submit" className="text-brand-600 hover:underline disabled:text-gray-400 disabled:no-underline" disabled={left > 0 || sending}>
            {left > 0 ? t("Отправить снова через {n} сек.", { n: left }) : t("Отправить код ещё раз")}
          </button>
        </ActionForm>
        <Button type="button" variant="ghost" className="min-h-0 px-0 py-1 text-gray-600 hover:bg-transparent hover:underline" onClick={() => setEditedFor(sendState.sentAt ?? 0)}>
          Изменить номер
        </Button>
      </div>
    </div>
  );
}

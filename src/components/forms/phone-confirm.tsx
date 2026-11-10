"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { requestRegisterCodeAction, type RegisterCodeState } from "@/app/(auth)/register/actions";

const RESEND_SEC = 60;

// Подтверждение номера при регистрации: код из бота Telegram (или SMS) вводится в ту же форму.
// Телефон берётся из поля loginPhone этой формы; сам код проверяет сервер при отправке формы.
export function PhoneConfirm({ telegram, sms, error, defaultCode }: { telegram: "bot" | "gateway" | null; sms: boolean; error?: string[]; defaultCode?: string }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RegisterCodeState>({});
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = state.sentAt ? Math.max(0, RESEND_SEC - Math.floor((Math.max(now, state.sentAt) - state.sentAt) / 1000)) : 0;

  const request = (channel: "TELEGRAM" | "SMS") =>
    start(async () => {
      const input = box.current?.closest("form")?.elements.namedItem("loginPhone");
      const phone = input instanceof HTMLInputElement ? input.value : "";
      const r = await requestRegisterCodeAction(phone, channel);
      setState((prev) => (r.ok ? r : { ...prev, error: r.error, errorParams: r.errorParams }));
    });

  const viaBot = state.ok && state.channel === "TELEGRAM" && !!state.botUrl;
  return (
    <div ref={box} className="space-y-3 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-200">
      <p className="text-sm text-gray-700">
        {t(telegram === "bot" ? "Подтвердите номер: получите код в нашем боте Telegram и введите его здесь." : "Подтвердите номер: получите код и введите его здесь.")}
      </p>
      {state.error && <Alert tone="error">{t(state.error, state.errorParams)}</Alert>}
      <div className="flex flex-wrap gap-2">
        {telegram && (
          <Button type="button" variant="secondary" disabled={pending || left > 0} onClick={() => request("TELEGRAM")}>
            {left > 0 ? t("Отправить снова через {n} сек.", { n: left }) : t(state.ok ? "Отправить код ещё раз" : "Получить код в Telegram")}
          </Button>
        )}
        {sms && (
          <Button type="button" variant="secondary" disabled={pending || left > 0} onClick={() => request("SMS")}>
            {t("Получить код по SMS")}
          </Button>
        )}
      </div>
      {viaBot && (
        <>
          <Alert tone="info">{t("Откройте бота, нажмите «Старт», затем «Поделиться номером» — бот пришлёт код. Номер в Telegram должен совпадать с телефоном для входа.")}</Alert>
          <a
            href={state.botUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 w-full items-center justify-center rounded-xl bg-[#229ED9] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1c8cc2]"
          >
            {t("Открыть бота в Telegram")}
          </a>
        </>
      )}
      {state.ok && !viaBot && <Alert tone="info">{t(state.channel === "SMS" ? "Код отправлен по SMS." : "Код придёт в Telegram от аккаунта «Verification Codes».")}</Alert>}
      <Field label="Код подтверждения" name="phoneCode" error={error}>
        <Input name="phoneCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} placeholder="000000" defaultValue={defaultCode} className="text-center text-lg tracking-[0.4em]" required />
      </Field>
    </div>
  );
}

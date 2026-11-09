"use client";

import { useState, useTransition } from "react";
import { Alert, Badge, Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { telegramLinkAction, telegramUnlinkAction } from "./telegram-actions";

export function TelegramLinkCard({ linked }: { linked: boolean }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 text-sm">
      <p className="text-gray-600">{t("Коды для входа без пароля будут приходить от нашего бота в Telegram.")}</p>
      <div>{linked ? <Badge color="green">Подключён</Badge> : <Badge>Не подключён</Badge>}</div>
      {error && <Alert tone="error">{error}</Alert>}
      {url ? (
        <div className="space-y-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 py-2.5 font-medium text-on-brand hover:bg-brand-700">
            {t("Открыть бота в Telegram")}
          </a>
          <p className="text-xs text-gray-500">{t("В боте нажмите «Поделиться номером». Ссылка действует 15 минут.")}</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={linked ? "secondary" : "primary"}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await telegramLinkAction();
                setError(r.error ?? null);
                setUrl(r.url ?? null);
              })
            }
          >
            {linked ? "Подключить заново" : "Подключить Telegram"}
          </Button>
          {linked && (
            <Button variant="ghost" className="text-red-600" disabled={pending} onClick={() => start(() => telegramUnlinkAction())}>
              Отключить
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

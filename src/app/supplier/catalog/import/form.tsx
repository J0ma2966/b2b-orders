"use client";

import { useActionState, useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatQty } from "@/lib/catalog";
import { useT } from "@/lib/i18n/client";
import { importCatalogAction, type ImportState } from "./actions";

const SHOW = 30;
const again = "inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-medium text-brand-700 ring-1 ring-gray-300 hover:bg-gray-50";

function List({ title, items }: { title: string; items: string[] }) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <details className="rounded-lg p-3 ring-1 ring-gray-200" open={items.length <= 10}>
      <summary className="cursor-pointer text-sm font-semibold">
        {t(title)}: {items.length}
      </summary>
      <ul className="mt-2 space-y-0.5 text-sm text-gray-700">
        {items.slice(0, SHOW).map((x, i) => (
          <li key={i}>{x}</li>
        ))}
        {items.length > SHOW && <li className="text-gray-500">{t("и ещё {n}", { n: items.length - SHOW })}</li>}
      </ul>
    </details>
  );
}

// Новый «заход» — новый экземпляр формы с чистым состоянием
export function ImportForm() {
  const [round, setRound] = useState(0);
  return <ImportRound key={round} onAgain={() => setRound((r) => r + 1)} />;
}

function ImportRound({ onAgain }: { onAgain: () => void }) {
  const t = useT();
  const [state, action, pending] = useActionState<ImportState, FormData>(importCatalogAction, {});
  const p = state.plan;
  const lists = p && (
    <div className="space-y-2">
      <List title="Новые товары" items={p.newProducts} />
      <List title="Новые единицы у существующих товаров" items={p.newUnits} />
      <List
        title="Изменение цены"
        items={p.prices.map((x) => `${x.label}: ${x.old === null ? t("без цены") : t.money(x.old)} → ${t.money(x.new)}${x.drop ? ` ⚠ ${t("снижение на 30% и больше — уйдёт на проверку администратору")}` : ""}`)}
      />
      <List title="Приход на склад" items={p.incomes.map((x) => `${x.label}: +${formatQty(x.qty)}`)} />
      {p.unchanged > 0 && <p className="text-sm text-gray-500">{t("Без изменений: {n}", { n: p.unchanged })}</p>}
    </div>
  );
  if (state.done) {
    return (
      <div className="space-y-3">
        <Alert tone="success">{t("Файл «{name}» загружен.", { name: state.fileName })}</Alert>
        {lists}
        <button type="button" onClick={onAgain} className={again}>{t("Загрузить другой файл")}</button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.errors && state.errors.length > 0 && (
        <Alert tone="warning">
          <p className="font-medium">{t("Эти строки будут пропущены:")}</p>
          <ul className="mt-1 list-disc pl-5">
            {state.errors.slice(0, SHOW).map((e) => (
              <li key={e}>{t(e)}</li>
            ))}
            {state.errors.length > SHOW && <li>{t("и ещё {n}", { n: state.errors.length - SHOW })}</li>}
          </ul>
        </Alert>
      )}
      {p && state.payload ? (
        <>
          <p className="text-sm">{t("Проверьте, что изменится после загрузки «{name}»:", { name: state.fileName })}</p>
          {lists}
          <div className="flex flex-wrap gap-2">
            <ActionForm action={action} pending={pending}>
              <input type="hidden" name="payload" value={state.payload} />
              <input type="hidden" name="fileName" value={state.fileName} />
              <SubmitButton pendingText="Загружаю…">{t("Применить")}</SubmitButton>
            </ActionForm>
            <button type="button" onClick={onAgain} className={again}>{t("Выбрать другой файл")}</button>
          </div>
        </>
      ) : (
        <ActionForm action={action} pending={pending} className="space-y-3">
          <Field label="Файл Excel (.xlsx)" name="file">
            <Input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
          </Field>
          <SubmitButton pendingText="Проверяю…">{t("Проверить файл")}</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

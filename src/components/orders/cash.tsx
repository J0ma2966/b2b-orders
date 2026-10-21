import type { getT } from "@/lib/i18n/server";

// Строка сдачи кассы (Д1): сумма и расхождение с тем, что было на руках
export function HandoverRow({ h, t }: { h: { createdAt: Date; amount: { toString(): string }; onHand: { toString(): string }; comment: string | null }; t: Awaited<ReturnType<typeof getT>> }) {
  const diff = Math.round((Number(h.onHand) - Number(h.amount)) * 100) / 100;
  return (
    <li className="flex justify-between gap-3 px-4 py-3 text-sm">
      <span>
        {t.dateTime(h.createdAt)}
        {h.comment && <span className="block text-xs text-gray-500">{h.comment}</span>}
      </span>
      <span className="text-right">
        <b className="tabular-nums">{t.money(h.amount)}</b>
        {diff !== 0 && (
          <span className={`block text-xs ${diff > 0 ? "text-red-600" : "text-yellow-700"}`}>
            {diff > 0 ? t("не хватало {sum}", { sum: t.money(diff) }) : t("сдано больше на {sum}", { sum: t.money(-diff) })}
          </span>
        )}
      </span>
    </li>
  );
}

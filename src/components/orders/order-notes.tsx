import { MessageSquareText, TriangleAlert } from "lucide-react";
import { cn } from "@/components/ui";
import { formatQty } from "@/lib/catalog";
import { lineTotal } from "@/lib/order-core";
import { getT } from "@/lib/i18n/server";
import type { OrderItemKind } from "@/generated/prisma/enums";

// Комментарий магазина к заказу: наверху карточки заказа, чтобы его прочли до того, как принять или везти.
// Спокойный блок: цветная полоса слева, значок и подпись — заметно, но без «крика».
export async function OrderComment({ text, label = "Комментарий магазина", className }: { text: string | null | undefined; label?: string; className?: string }) {
  if (!text?.trim()) return null;
  const t = await getT();
  return (
    <aside data-testid="order-comment" className={cn("flex gap-3 rounded-2xl border-l-4 border-yellow-700 bg-yellow-50 py-3 pr-4 pl-3.5", className)}>
      <MessageSquareText className="mt-0.5 size-5 shrink-0 text-yellow-700" strokeWidth={2} aria-hidden />
      <div className="min-w-0">
        <div className="text-xs font-semibold tracking-wide text-yellow-800 uppercase">{t(label)}</div>
        <p className="mt-0.5 text-[15px] leading-snug font-medium break-words whitespace-pre-line text-ink">{text}</p>
      </div>
    </aside>
  );
}

type ForcedItem = { kind: OrderItemKind; productName: string; unitLabel: string; qty: { toString(): string }; price: { toString(): string } };

// В заказе есть принудительная продажа: что добавил поставщик и на какую сумму
export async function ForcedNotice({ items, viewer, className }: { items: ForcedItem[]; viewer: "shop" | "supplier" | "courier"; className?: string }) {
  const forced = items.filter((i) => i.kind === "FORCED");
  if (forced.length === 0) return null;
  const t = await getT();
  const sum = forced.reduce((s, i) => s + lineTotal(Number(i.price), Number(i.qty)), 0);
  return (
    <aside data-testid="forced-notice" className={cn("flex gap-3 rounded-2xl border-l-4 border-red-600 bg-red-50 py-3 pr-4 pl-3.5", className)}>
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-red-600" strokeWidth={2} aria-hidden />
      <div className="min-w-0">
        <div className="text-xs font-semibold tracking-wide text-red-700 uppercase">{t("Принудительная продажа")}</div>
        <p className="mt-0.5 text-sm leading-snug text-ink">
          {t(viewer === "shop" ? "Поставщик добавил в заказ товары, которые вы не заказывали, на {sum}:" : "В заказ добавлены товары сверх заказа магазина на {sum}:", { sum: t.money(sum) })}
        </p>
        <ul className="mt-1 space-y-0.5 text-sm font-medium text-ink">
          {forced.map((i, n) => (
            <li key={n} className="break-words">
              {i.productName} — {formatQty(i.qty)} {t(i.unitLabel)}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

// Пометки в строке списка заказов: есть комментарий, есть принудительная продажа
export async function OrderFlags({ comment, forced, className }: { comment?: string | null; forced?: boolean; className?: string }) {
  if (!comment?.trim() && !forced) return null;
  const t = await getT();
  return (
    <div className={cn("mt-1 flex min-w-0 flex-wrap items-center gap-1.5", className)} data-testid="order-flags">
      {forced && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
          <TriangleAlert className="size-3.5" strokeWidth={2.2} aria-hidden />
          {t("Принудительная продажа")}
        </span>
      )}
      {comment?.trim() && (
        <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-800 ring-1 ring-yellow-200">
          <MessageSquareText className="size-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
          <span className="truncate">{comment.trim()}</span>
        </span>
      )}
    </div>
  );
}

import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import type { multiOverdueShops } from "@/lib/accounts";
import { formatPhone } from "@/lib/phone";
import { getT } from "@/lib/i18n/server";

type Rows = Awaited<ReturnType<typeof multiOverdueShops>>;

// А3: магазины с просрочкой сразу у нескольких поставщиков. Только для админа — поставщики этого не видят.
export async function MultiOverdueList({ rows }: { rows: Rows }) {
  const t = await getT();
  if (!rows.length) return <EmptyState>{t("Магазинов с просрочкой у нескольких поставщиков нет")}</EmptyState>;
  return (
    <Card className="p-0 sm:p-0">
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => (
          <li key={r.shopId} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <Link className="font-semibold text-brand-600" href={`/admin/shops/${r.shopId}`}>{r.shop.name}</Link>
                <span className="text-gray-500"> · {formatPhone(r.shop.phone)}</span>
              </span>
              <b className="text-red-700 tabular-nums">{t("просрочено {sum}", { sum: t.money(r.overdueTotal) })}</b>
            </div>
            <OverdueAccounts accounts={r.accounts} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export async function OverdueAccounts({ accounts }: { accounts: Rows[number]["accounts"] }) {
  const t = await getT();
  return (
    <ul className="mt-1 space-y-0.5 text-gray-600">
      {accounts.map((a) => (
        <li key={a.supplierId} className="flex flex-wrap justify-between gap-2">
          <span>{a.supplier.displayName}</span>
          <span className="tabular-nums">
            {t("просрочено {sum} на {days} дн.", { sum: t.money(a.overdueAmount), days: a.overdueDays })}
            <span className="text-gray-400"> · {t("долг {sum}", { sum: t.money(a.balance) })}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

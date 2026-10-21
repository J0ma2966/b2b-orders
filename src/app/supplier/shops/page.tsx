import { ExportLink } from "@/components/ui/export-link";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { balanceLabel } from "@/components/orders/order-view";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { formatPhone } from "@/lib/phone";
import { getT } from "@/lib/i18n/server";

// Магазины поставщика и задолженность (ТЗ п. 73)
export default async function SupplierShopsPage({ searchParams }: PageProps<"/supplier/shops">) {
  const t = await getT();
  const ctx = await requireActiveSupplier();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const filter = typeof sp.status === "string" ? sp.status : "";
  const shops = await db.shop.findMany({
    where: {
      OR: [{ orders: { some: { supplierId: ctx.supplier.id, status: { not: "DRAFT" } } } }, { accounts: { some: { supplierId: ctx.supplier.id } } }],
      ...(q && { name: { contains: q, mode: "insensitive" as const } }),
      ...(filter === "debt" && { accounts: { some: { supplierId: ctx.supplier.id, balance: { gt: 0 } } } }),
      ...(filter === "credit" && { accounts: { some: { supplierId: ctx.supplier.id, creditAllowed: true } } }),
    },
    include: {
      accounts: { where: { supplierId: ctx.supplier.id } },
      _count: { select: { orders: { where: { supplierId: ctx.supplier.id, status: { in: ["COMPLETED", "PARTIALLY_ACCEPTED"] } } } } },
    },
    orderBy: { name: "asc" },
    take: 200,
  });
  const totalDebt = shops.reduce((s, sh) => s + Math.max(0, Number(sh.accounts[0]?.balance ?? 0)), 0);
  return (
    <>
      <PageHeader title="Магазины и задолженность" subtitle={`Общий долг магазинов: ${t.money(totalDebt)}`} actions={<ExportLink href="/api/export/supplier/debts" />} />
      <FilterBar q={q} status={filter} statuses={[["debt", "С долгом"], ["credit", "Работают в долг"]]} allLabel="Все магазины" placeholder="Название магазина" />
      {shops.length === 0 ? (
        <EmptyState>{t("Магазины появятся после первых заказов")}</EmptyState>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-gray-100">
            {shops.map((s) => {
              const acc = s.accounts[0];
              const balance = Number(acc?.balance ?? 0);
              return (
                <li key={s.id}>
                  <Link href={`/supplier/shops/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-gray-500">{formatPhone(s.phone)} · {t("заказов {n}", { n: s._count.orders })} · {acc?.creditAllowed ? t("в долг разрешено") : t("без долга")}</div>
                    </div>
                    <div className={balance > 0 ? "font-semibold text-red-700" : "text-gray-600"}>{balanceLabel(balance, t)}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

import Link from "next/link";
import { Card } from "@/components/ui";
import { balanceLabel, OrdersList } from "./order-view";
import { ReplacementList } from "./replacement-view";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";

// Заказы, продажи, задолженность и замены в карточке магазина или поставщика (ТЗ п. 77–78)
export async function EntityActivity({ shopId, supplierId }: { shopId?: string; supplierId?: string }) {
  const where = shopId ? { shopId } : { supplierId };
  const [orders, sales, accounts, replacements, extra] = await Promise.all([
    db.order.findMany({ where: { ...where, status: { not: "DRAFT" } }, include: { shop: true, supplier: true }, orderBy: { placedAt: "desc" }, take: 10 }),
    db.order.aggregate({ where: { ...where, status: { in: ["COMPLETED", "PARTIALLY_ACCEPTED"] } }, _sum: { total: true }, _count: true }),
    db.shopAccount.findMany({ where: { ...where, balance: { not: 0 } }, include: { shop: true, supplier: true }, orderBy: { balance: "desc" }, take: 20 }),
    db.replacement.findMany({ where, include: { order: true, shop: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    supplierId
      ? Promise.all([
          db.product.count({ where: { supplierId, archivedAt: null } }),
          db.order.groupBy({ by: ["shopId"], where: { supplierId, status: { not: "DRAFT" } } }).then((r) => r.length),
          db.bonusPromotion.count({ where: { supplierId, isActive: true } }),
          db.antifraudEvent.count({ where: { supplierId } }),
        ])
      : null,
  ]);
  const debt = accounts.reduce((s, a) => s + Math.max(0, Number(a.balance)), 0);
  const tiles: [string, string | number][] = [
    ["Получено заказов", sales._count],
    ["Оборот", formatMoney(sales._sum.total ?? 0)],
    ["Долг магазинов", formatMoney(debt)],
    ["Замен", replacements.length],
    ...(extra ? ([["Товаров в каталоге", extra[0]], ["Магазинов", extra[1]], ["Активных бонусов", extra[2]], ["Антифрод-событий", extra[3]]] as [string, number][]) : []),
  ];
  return (
    <div className="mt-6 space-y-4">
      <h2 className="text-lg font-semibold">Статистика и работа</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([l, v]) => <Card key={l} className="p-3 sm:p-4"><div className="text-lg font-semibold">{v}</div><div className="text-xs text-gray-500">{l}</div></Card>)}
      </div>
      {accounts.length > 0 && (
        <Card className="p-0 sm:p-0">
          <h3 className="px-4 pt-3 text-sm font-semibold">Задолженность</h3>
          <ul className="divide-y divide-gray-100">
            {accounts.map((a) => <li key={a.id} className="flex justify-between px-4 py-2 text-sm"><span>{shopId ? a.supplier.displayName : a.shop.name}</span><b>{balanceLabel(Number(a.balance))}</b></li>)}
          </ul>
        </Card>
      )}
      {orders.length > 0 && (
        <>
          <h3 className="text-sm font-semibold">Последние заказы · <Link className="text-brand-600" href="/admin/orders">все</Link></h3>
          <OrdersList rows={orders} href={(id) => `/admin/orders/${id}`} party={(o) => (shopId ? o.supplier.displayName : o.shop.name)} />
        </>
      )}
      {replacements.length > 0 && (
        <>
          <h3 className="text-sm font-semibold">Замены</h3>
          <ReplacementList rows={replacements} />
        </>
      )}
    </div>
  );
}

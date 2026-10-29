import { Card, PageHeader } from "@/components/ui";
import { HandoverRow } from "@/components/orders/cash";
import { requireActiveSupplier } from "@/lib/auth/current";
import { courierCash } from "@/lib/cash";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { HandoverForm } from "./form";
import { isDeliverer } from "@/lib/supplier-roles";

// Д1: касса доставщиков — у кого сколько наличных на руках, приём наличных
export default async function SupplierCashPage() {
  const [ctx, t] = await Promise.all([requireActiveSupplier(), getT()]);
  // Сдают кассу доставщики и администраторы, которые развозят сами; владельцу сдавать некому
  const couriers = await db.supplierMember.findMany({ where: { supplierId: ctx.supplier.id, role: { in: ["COURIER", "ADMIN"] } }, include: { user: true }, orderBy: { createdAt: "asc" } });
  const rows = await Promise.all(
    couriers.map(async (c) => ({
      c,
      cash: await courierCash(ctx.supplier.id, c.userId),
      history: await db.cashHandover.findMany({ where: { supplierId: ctx.supplier.id, courierId: c.userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    })),
  );
  const visible = rows.filter((r) => (r.c.isActive && isDeliverer(r.c)) || r.cash.onHand !== 0);
  return (
    <>
      <PageHeader title="Касса доставщиков" subtitle={t("Наличные, полученные при доставке, минус принятые от доставщика")} />
      {visible.length === 0 && <p className="text-sm text-gray-500">{t("Доставщиков пока нет")}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map(({ c, cash, history }) => (
          <Card key={c.id} className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">{c.user.fullName}</h2>
              <span className="text-xl font-bold tabular-nums">{t.money(cash.onHand)}</span>
            </div>
            <p className="text-sm text-gray-500">{t("Сегодня получено {sum} по {n} заказам", { sum: t.money(cash.today), n: cash.todayOrders })}</p>
            {cash.onHand > 0 && <HandoverForm courierId={c.userId} onHand={cash.onHand} />}
            {history.length > 0 && (
              <ul className="divide-y divide-gray-100 rounded-lg ring-1 ring-gray-100">
                {history.map((h) => (
                  <HandoverRow key={h.id} h={h} t={t} />
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

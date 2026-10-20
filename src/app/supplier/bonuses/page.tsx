import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { formatQty, unitName } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { BonusForm } from "./form";
import { toggleBonusAction } from "./actions";

export default async function BonusesPage() {
  const ctx = await requireActiveSupplier();
  const [promos, units, given] = await Promise.all([
    db.bonusPromotion.findMany({
      where: { supplierId: ctx.supplier.id },
      include: { triggerUnit: { include: { product: true } }, giftUnit: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.productUnit.findMany({
      where: { isActive: true, product: { supplierId: ctx.supplier.id, archivedAt: null } },
      include: { product: true },
      orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
    }),
    db.orderItem.groupBy({
      by: ["bonusPromotionId"],
      where: { kind: "BONUS", order: { supplierId: ctx.supplier.id, status: { notIn: ["DRAFT", "CANCELLED_BY_SHOP", "CANCELLED_BY_SUPPLIER", "REJECTED"] } } },
      _sum: { qty: true },
    }),
  ]);
  const givenBy = new Map(given.map((g) => [g.bonusPromotionId, g._sum.qty]));
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
  return (
    <>
      <PageHeader title="Бонусы" subtitle="Подарок добавляется в заказ автоматически, бесплатно для магазина и только из доступного остатка" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {promos.length === 0 && <EmptyState>Акций пока нет</EmptyState>}
          {promos.map((p) => {
            const running = p.isActive && p.startsAt <= now && p.endsAt >= now;
            return (
              <Card key={p.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="mt-1 text-sm text-gray-700">
                      {p.repeatable ? "За каждые" : "При покупке от"} {formatQty(p.triggerQty)} {unitName(p.triggerUnit)} «{p.triggerUnit.product.name}» — {formatQty(p.giftQty)} {unitName(p.giftUnit)} «{p.giftUnit.product.name}» в подарок
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {formatDate(p.startsAt)} — {formatDate(p.endsAt)} · выдано {formatQty(givenBy.get(p.id) ?? 0)}
                    </div>
                  </div>
                  <Badge color={running ? "green" : "gray"}>{running ? "Действует" : p.isActive ? "Не в сроке" : "Выключена"}</Badge>
                </div>
                <form action={toggleBonusAction} className="mt-2">
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton variant="secondary" pendingText="…">{p.isActive ? "Выключить" : "Включить"}</SubmitButton>
                </form>
              </Card>
            );
          })}
        </div>
        <Card>
          <h2 className="mb-3 font-semibold">Новая акция</h2>
          <BonusForm today={today} units={units.map((u) => ({ id: u.id, label: `${u.product.name} — ${unitName(u)}` }))} />
        </Card>
      </div>
    </>
  );
}

import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { formatQty, unitName } from "@/lib/catalog";
import { formatDate } from "@/lib/format";

export default async function AdminBonusesPage() {
  await requireSuperAdmin();
  const now = new Date();
  const rows = await db.bonusPromotion.findMany({
    include: { supplier: true, triggerUnit: { include: { product: true } }, giftUnit: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Бонусные акции" />
      {rows.length === 0 ? <EmptyState>Акций нет</EmptyState> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-gray-100">
            {rows.map((p) => {
              const running = p.isActive && p.startsAt <= now && p.endsAt >= now;
              return (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                  <div>
                    <div className="font-medium">{p.name} · {p.supplier.displayName}</div>
                    <div className="text-xs text-gray-500">
                      {formatQty(p.triggerQty)} {unitName(p.triggerUnit)} «{p.triggerUnit.product.name}» → {formatQty(p.giftQty)} {unitName(p.giftUnit)} «{p.giftUnit.product.name}» · {formatDate(p.startsAt)} — {formatDate(p.endsAt)}
                    </div>
                  </div>
                  <Badge color={running ? "green" : "gray"}>{running ? "Действует" : "Не действует"}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

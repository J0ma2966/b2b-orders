import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { formatQty, unitName } from "@/lib/catalog";
import { getT } from "@/lib/i18n/server";

export default async function AdminBonusesPage() {
  const t = await getT();
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
      {rows.length === 0 ? <EmptyState>{t("Акций нет")}</EmptyState> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-gray-100">
            {rows.map((p) => {
              const running = p.isActive && p.startsAt <= now && p.endsAt >= now;
              return (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                  <div>
                    <div className="font-medium">{p.name} · {p.supplier.displayName}</div>
                    <div className="text-xs text-gray-500">
                      {formatQty(p.triggerQty)} {t(unitName(p.triggerUnit))} «{p.triggerUnit.product.name}» → {formatQty(p.giftQty)} {t(unitName(p.giftUnit))} «{p.giftUnit.product.name}» · {t.date(p.startsAt)} — {t.date(p.endsAt)}
                    </div>
                  </div>
                  <Badge color={running ? "green" : "gray"}>{running ? t("Действует") : t("Не действует")}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

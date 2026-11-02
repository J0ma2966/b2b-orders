import Link from "next/link";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { unitName } from "@/lib/catalog";
import { ancestorChain } from "@/lib/territory-core";
import { loadTerritoryMap } from "@/lib/territory";
import type { AntifraudStatus } from "@/generated/prisma/enums";
import { restoreSupplierVisibilityAction } from "./actions";
import { ResolveForm } from "./resolve-form";
import { getT } from "@/lib/i18n/server";

const STATUS: Record<AntifraudStatus, [string, "yellow" | "green" | "red" | "blue"]> = {
  OPEN: ["Новое", "yellow"],
  WATCHING: ["Под наблюдением", "blue"],
  CONFIRMED: ["Подтверждено", "green"],
  REJECTED: ["Отклонено", "red"],
};

export default async function AntifraudPage({ searchParams }: PageProps<"/admin/antifraud">) {
  const t = await getT();
  await requireSuperAdmin();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && sp.status in STATUS ? (sp.status as AntifraudStatus) : undefined;
  const [events, byId] = await Promise.all([
    db.antifraudEvent.findMany({
      where: status ? { status } : { status: { in: ["OPEN", "WATCHING"] } },
      include: { supplier: { include: { territories: true } }, productUnit: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    loadTerritoryMap(),
  ]);
  const userIds = [...new Set(events.flatMap((e) => [e.userId, e.onBehalfOfUserId]).filter((x): x is string => !!x))];
  const users = new Map((await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  // Потенциально затронутые магазины: точки на территории доставки поставщика
  const shopCounts = new Map<string, number>();
  for (const e of events) {
    if (shopCounts.has(e.supplierId)) continue;
    const covered = new Set(e.supplier.territories.map((t) => t.territoryId));
    const shops = await db.shop.findMany({ where: { isBlocked: false }, select: { territoryId: true } });
    shopCounts.set(e.supplierId, shops.filter((s) => ancestorChain(s.territoryId, byId).some((t) => covered.has(t.id))).length);
  }
  return (
    <>
      <PageHeader title="Антифрод цен" subtitle="Снижение цены на 30% и более" />
      {typeof sp.saved === "string" && (
        <div className="mb-4">
          <Alert tone="success">Решение сохранено</Alert>
        </div>
      )}
      <FilterBar status={status} allLabel="Открытые" statuses={Object.entries(STATUS).map(([k, v]) => [k, v[0]])} search={false} />
      {events.length === 0 ? (
        <EmptyState>{t("Событий нет")}</EmptyState>
      ) : (
        <div className="space-y-4">
          {events.map((e) => (
            <Card key={e.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">
                    {e.productUnit.product.name} · {t(unitName(e.productUnit))}
                  </div>
                  <div className="text-sm">
                    <Link href={`/admin/suppliers/${e.supplierId}`} className="text-brand-600">{e.supplier.displayName}</Link>
                    {e.supplier.ordersDisabled && <Badge color="red">{t("заказы запрещены")}</Badge>} {e.supplier.hiddenFromShops && <Badge color="red">{t("скрыт")}</Badge>}
                  </div>
                </div>
                <Badge color={STATUS[e.status][1]}>{STATUS[e.status][0]}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><div className="text-xs text-gray-500">{t("Было")}</div>{t.money(e.oldPrice)}</div>
                <div><div className="text-xs text-gray-500">{t("Стало")}</div>{t.money(e.newPrice)}</div>
                <div><div className="text-xs text-gray-500">{t("Изменение")}</div><b className="text-red-600">{e.changePct.toString()}%</b></div>
                <div><div className="text-xs text-gray-500">{t("Текущая цена")}</div>{t.money(e.productUnit.price)}</div>
                <div><div className="text-xs text-gray-500">{t("Кто")}</div>{e.userId ? users.get(e.userId) : "—"}{e.onBehalfOfUserId && ` ${t("(от имени {name})", { name: users.get(e.onBehalfOfUserId) })}`}</div>
                <div><div className="text-xs text-gray-500">{t("Когда")}</div>{t.dateTime(e.createdAt)}</div>
                <div><div className="text-xs text-gray-500">{t("Магазинов на территории")}</div>{shopCounts.get(e.supplierId)}</div>
                <div><div className="text-xs text-gray-500">{t("Активные заказы, оборот, комиссия")}</div><span className="text-gray-400">{t("после этапа заказов")}</span></div>
              </div>
              {(e.status === "OPEN" || e.status === "WATCHING") && <ResolveForm eventId={e.id} />}
              {e.resolution && <p className="mt-2 text-xs text-gray-500">{t("Комментарий:")} {e.resolution}</p>}
              {(e.supplier.ordersDisabled || e.supplier.hiddenFromShops) && (
                <div className="mt-3 flex gap-3 border-t border-gray-100 pt-3">
                  {e.supplier.ordersDisabled && (
                    <form action={restoreSupplierVisibilityAction}>
                      <input type="hidden" name="supplierId" value={e.supplierId} />
                      <input type="hidden" name="field" value="ordersDisabled" />
                      <button className="text-xs text-brand-600">{t("Снова разрешить заказы")}</button>
                    </form>
                  )}
                  {e.supplier.hiddenFromShops && (
                    <form action={restoreSupplierVisibilityAction}>
                      <input type="hidden" name="supplierId" value={e.supplierId} />
                      <input type="hidden" name="field" value="hiddenFromShops" />
                      <button className="text-xs text-brand-600">{t("Снова показывать магазинам")}</button>
                    </form>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

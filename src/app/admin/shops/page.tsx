import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { formatPhone } from "@/lib/phone";
import { loadTerritoryMap } from "@/lib/territory";
import { territoryLabel } from "@/lib/territory-core";
import { SHOP_STATUS_COLOR, SHOP_STATUS_LABEL } from "@/lib/statuses";
import type { Prisma, ShopStatus } from "@/generated/prisma/client";
import { getT } from "@/lib/i18n/server";

export default async function ShopsPage({ searchParams }: PageProps<"/admin/shops">) {
  const t = await getT();
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" && sp.status in SHOP_STATUS_LABEL ? (sp.status as ShopStatus) : undefined;
  const page = pageFrom(sp);
  const where: Prisma.ShopWhereInput = {
    ...(status && { status }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { inn: { contains: q } },
        { phone: { contains: q } },
        { address: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
  const [total, rows, byId] = await Promise.all([
    db.shop.count({ where }),
    db.shop.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    loadTerritoryMap(),
  ]);
  return (
    <>
      <PageHeader title="Магазины" />
      <FilterBar q={q} status={status} statuses={Object.entries(SHOP_STATUS_LABEL)} placeholder="Название, ИНН, телефон, адрес" />
      {rows.length === 0 ? (
        <EmptyState>{t("Магазинов не найдено")}</EmptyState>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-gray-100">
            {rows.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/shops/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.name} {s.isBlocked && <span className="text-xs text-red-600">{t("· заблокирован")}</span>}</div>
                    <div className="text-xs text-gray-500">
                      {territoryLabel(s.territoryId, byId, t)} · {formatPhone(s.phone)} · {t("с {date}", { date: t.date(s.createdAt) })}
                    </div>
                  </div>
                  <Badge color={SHOP_STATUS_COLOR[s.status]}>{SHOP_STATUS_LABEL[s.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination page={page} total={total} basePath="/admin/shops" params={{ q, status }} />
    </>
  );
}

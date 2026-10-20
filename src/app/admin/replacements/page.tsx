import { EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { ReplacementList } from "@/components/orders/replacement-view";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { REPLACEMENT_STATUS_LABEL } from "@/lib/replacement-core";
import type { ReplacementStatus } from "@/generated/prisma/enums";
import { getT } from "@/lib/i18n/server";

export default async function AdminReplacementsPage({ searchParams }: PageProps<"/admin/replacements">) {
  const t = await getT();
  await requireSuperAdmin();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && sp.status in REPLACEMENT_STATUS_LABEL ? (sp.status as ReplacementStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const rows = await db.replacement.findMany({
    where: { ...(status && { status }), ...(q && { OR: [{ productName: { contains: q, mode: "insensitive" } }, { shop: { name: { contains: q, mode: "insensitive" } } }, { supplier: { displayName: { contains: q, mode: "insensitive" } } }] }) },
    include: { order: true, shop: true, supplier: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Замены" />
      <FilterBar q={q} status={status} statuses={Object.entries(REPLACEMENT_STATUS_LABEL)} placeholder="Товар, магазин, поставщик" />
      {rows.length === 0 ? <EmptyState>{t("Заявок нет")}</EmptyState> : <ReplacementList rows={rows.map((r) => ({ ...r, shop: { name: `${r.shop.name} ← ${r.supplier.displayName}` } }))} />}
    </>
  );
}

import { EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { ReplacementList } from "@/components/orders/replacement-view";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { REPLACEMENT_STATUS_LABEL } from "@/lib/replacement-core";
import type { ReplacementStatus } from "@/generated/prisma/enums";
import { getT } from "@/lib/i18n/server";

export default async function SupplierReplacementsPage({ searchParams }: PageProps<"/supplier/replacements">) {
  const t = await getT();
  const ctx = await requireActiveSupplier();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && sp.status in REPLACEMENT_STATUS_LABEL ? (sp.status as ReplacementStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const rows = await db.replacement.findMany({
    where: { supplierId: ctx.supplier.id, ...(status && { status }), ...(q && { OR: [{ productName: { contains: q, mode: "insensitive" } }, { shop: { name: { contains: q, mode: "insensitive" } } }] }) },
    include: { order: true, shop: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Замены" />
      <FilterBar q={q} status={status} statuses={Object.entries(REPLACEMENT_STATUS_LABEL)} placeholder="Товар или магазин" />
      {rows.length === 0 ? <EmptyState>{t("Заявок нет")}</EmptyState> : <ReplacementList rows={rows} href={(id) => `/supplier/replacements/${id}`} />}
    </>
  );
}

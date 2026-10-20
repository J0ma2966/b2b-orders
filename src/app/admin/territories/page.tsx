import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { toggleTerritoryAction } from "../actions";
import { AddTerritoryForm } from "./add-form";
import { getT } from "@/lib/i18n/server";

const TYPE_LABEL = { COUNTRY: "Страна", REGION: "Регион", CITY: "Город", DISTRICT: "Район" } as const;

export default async function TerritoriesPage() {
  await requireSuperAdmin();
  const tr = await getT();
  const all = await db.territory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { shops: true, supplierTerritories: true } } },
  });
  const country = all.find((t) => t.type === "COUNTRY");
  const regions = all.filter((t) => t.type === "REGION");
  return (
    <>
      <PageHeader title="Территории" subtitle="Справочник регионов, городов и районов для территорий доставки и адресов магазинов" />
      <Card className="mb-4">
        <h2 className="mb-3 font-semibold">{tr("Добавить")}</h2>
        <AddTerritoryForm parents={[...(country ? [country] : []), ...regions].map((t) => ({ id: t.id, name: t.name, type: t.type }))} />
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {regions.map((r) => (
          <Card key={r.id}>
            <TerritoryRow t={r} />
            <ul className="mt-2 space-y-1 pl-4">
              {all
                .filter((c) => c.parentId === r.id)
                .map((c) => (
                  <li key={c.id}>
                    <TerritoryRow t={c} />
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}

async function TerritoryRow({
  t,
}: {
  t: { id: string; name: string; type: keyof typeof TYPE_LABEL; isActive: boolean; _count: { shops: number; supplierTerritories: number } };
}) {
  const tr = await getT();
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className={t.isActive ? (t.type === "REGION" ? "font-semibold" : "") : "text-gray-400 line-through"}>
        {tr(t.name)}{" "}
        <span className="text-xs font-normal text-gray-400">
          {tr(TYPE_LABEL[t.type])} · {tr("магазинов {n}", { n: t._count.shops })} · {tr("поставщиков {n}", { n: t._count.supplierTerritories })}
        </span>
      </span>
      <form action={toggleTerritoryAction}>
        <input type="hidden" name="id" value={t.id} />
        <button className="text-xs text-brand-600 hover:underline">{t.isActive ? tr("Скрыть") : tr("Вернуть")}</button>
      </form>
    </div>
  );
}

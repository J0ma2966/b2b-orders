import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { toggleTerritoryAction } from "../actions";
import { AddTerritoryForm } from "./add-form";

const TYPE_LABEL = { COUNTRY: "Страна", REGION: "Регион", CITY: "Город", DISTRICT: "Район" } as const;

export default async function TerritoriesPage() {
  await requireSuperAdmin();
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
        <h2 className="mb-3 font-semibold">Добавить</h2>
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

function TerritoryRow({
  t,
}: {
  t: { id: string; name: string; type: keyof typeof TYPE_LABEL; isActive: boolean; _count: { shops: number; supplierTerritories: number } };
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className={t.isActive ? (t.type === "REGION" ? "font-semibold" : "") : "text-gray-400 line-through"}>
        {t.name} <span className="text-xs font-normal text-gray-400">{TYPE_LABEL[t.type]} · магазинов {t._count.shops} · поставщиков {t._count.supplierTerritories}</span>
      </span>
      <form action={toggleTerritoryAction}>
        <input type="hidden" name="id" value={t.id} />
        <button className="text-xs text-brand-600 hover:underline">{t.isActive ? "Скрыть" : "Вернуть"}</button>
      </form>
    </div>
  );
}

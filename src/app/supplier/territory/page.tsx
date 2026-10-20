import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { getTerritoryOptions } from "@/lib/territory";
import { TerritoryForm } from "./form";

export default async function SupplierTerritoryPage() {
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const [territories, selected, shopsCovered] = await Promise.all([
    getTerritoryOptions(),
    db.supplierTerritory.findMany({ where: { supplierId: ctx.supplier.id } }),
    db.shop.count({
      where: {
        isBlocked: false,
        OR: [
          { territory: { supplierTerritories: { some: { supplierId: ctx.supplier.id } } } },
          { territory: { parent: { supplierTerritories: { some: { supplierId: ctx.supplier.id } } } } },
        ],
      },
    }),
  ]);
  return (
    <>
      <PageHeader title="Территория доставки" subtitle={`Магазинов на этой территории: ${shopsCovered}`} />
      <Card className="max-w-3xl">
        <TerritoryForm territories={territories} selected={selected.map((t) => t.territoryId)} />
      </Card>
    </>
  );
}

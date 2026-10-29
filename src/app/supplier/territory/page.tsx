import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { getTerritoryOptions } from "@/lib/territory";
import { TerritoryForm } from "./form";
import { TerritoryTermsForm } from "./terms-form";
import { Tr } from "@/components/ui/tr";
import { delivererWhere } from "@/lib/supplier-roles";

export default async function SupplierTerritoryPage() {
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const [territories, selected, shopsCovered, couriers] = await Promise.all([
    getTerritoryOptions(),
    db.supplierTerritory.findMany({ where: { supplierId: ctx.supplier.id }, include: { territory: { include: { parent: true } } } }),
    db.shop.count({
      where: {
        isBlocked: false,
        OR: [
          { territory: { supplierTerritories: { some: { supplierId: ctx.supplier.id } } } },
          { territory: { parent: { supplierTerritories: { some: { supplierId: ctx.supplier.id } } } } },
        ],
      },
    }),
    db.supplierMember.findMany({ where: { supplierId: ctx.supplier.id, ...delivererWhere }, include: { user: true } }),
  ]);
  return (
    <>
      <PageHeader title="Территория доставки" subtitle={`Магазинов на этой территории: ${shopsCovered}`} />
      <Card className="max-w-3xl">
        <TerritoryForm territories={territories} selected={selected.map((t) => t.territoryId)} />
      </Card>
      {selected.length > 0 && (
        <Card className="mt-6 max-w-3xl">
          <h2 className="mb-2 text-base font-semibold"><Tr>Дни доставки и доставщики</Tr></h2>
          <TerritoryTermsForm
            rows={selected.map((s) => ({
              territoryId: s.territoryId,
              name: s.territory.parent ? `${s.territory.parent.name} · ${s.territory.name}` : s.territory.name,
              weekdays: s.deliveryWeekdays,
              courierId: s.courierId,
            }))}
            couriers={couriers.map((c) => ({ id: c.userId, name: c.user.fullName }))}
          />
        </Card>
      )}
    </>
  );
}

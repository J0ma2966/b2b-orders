import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, DefinitionList, PageHeader } from "@/components/ui";
import { Media } from "@/components/orders/replacement-view";
import { AssignReplacementForm, DecideReplacementForm } from "@/components/orders/replacement-forms";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { formatQty } from "@/lib/catalog";
import { formatDateTime } from "@/lib/format";
import { REPLACEMENT_STATUS_COLOR, REPLACEMENT_STATUS_LABEL } from "@/lib/replacement-core";

export default async function SupplierReplacementPage({ params }: PageProps<"/supplier/replacements/[id]">) {
  const ctx = await requireActiveSupplier();
  const { id } = await params;
  const r = await db.replacement.findUnique({ where: { id }, include: { shop: true, order: true, courier: true, newOrder: true, productUnit: true } });
  if (!r || r.supplierId !== ctx.supplier.id) notFound();
  const [couriers, orders] = await Promise.all([
    db.supplierMember.findMany({ where: { supplierId: ctx.supplier.id, role: "COURIER", isActive: true }, include: { user: true } }),
    db.order.findMany({ where: { supplierId: ctx.supplier.id, shopId: r.shopId, status: { in: ["PLACED", "ACCEPTED", "ASSEMBLING", "READY", "ASSIGNED"] } }, orderBy: { placedAt: "desc" } }),
  ]);
  const available = Number(r.productUnit.physicalQty) - Number(r.productUnit.reservedQty);
  return (
    <>
      <PageHeader
        title={`Замена №${r.number}`}
        subtitle={<Badge color={REPLACEMENT_STATUS_COLOR[r.status]}>{REPLACEMENT_STATUS_LABEL[r.status]}</Badge>}
        actions={<Link href="/supplier/replacements" className="text-sm text-brand-600">← Все замены</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <DefinitionList
            items={[
              ["Товар", `${r.productName} — ${formatQty(r.qty)} ${r.unitLabel}`],
              ["Магазин", <Link key="s" className="text-brand-600" href={`/supplier/shops/${r.shopId}`}>{r.shop.name}</Link>],
              ["Исходный заказ", <Link key="o" className="text-brand-600" href={`/supplier/orders/${r.orderId}`}>№{r.order.number}</Link>],
              ["Причина", r.reason],
              ["Комментарий", r.comment],
              ["Создана", formatDateTime(r.createdAt)],
              ["Решение", r.decisionComment],
              ["Доставщик", r.courier?.fullName ?? (r.newOrder ? `с заказом №${r.newOrder.number}` : null)],
              ["Выполнена", r.completedAt ? formatDateTime(r.completedAt) : null],
            ]}
          />
          <Media photos={r.photoPaths} videos={r.videoPaths} />
        </Card>
        <div className="space-y-4">
          {r.status === "NEW" && (
            <Card>
              <h2 className="mb-1 font-semibold">Решение</h2>
              <p className="mb-3 text-sm text-gray-500">На складе доступно {formatQty(available)} {r.unitLabel}. При согласовании новый товар резервируется.</p>
              <DecideReplacementForm id={r.id} />
            </Card>
          )}
          {(r.status === "APPROVED" || r.status === "ASSIGNED") && (
            <Card>
              <h2 className="mb-3 font-semibold">Кто выполнит замену</h2>
              <AssignReplacementForm
                id={r.id}
                couriers={couriers.map((c) => ({ id: c.userId, name: c.user.fullName }))}
                orders={orders.map((o) => ({ id: o.id, label: `Заказ №${o.number}` }))}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

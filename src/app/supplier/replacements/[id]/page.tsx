import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, DefinitionList, PageHeader } from "@/components/ui";
import { Media } from "@/components/orders/replacement-view";
import { AssignReplacementForm, CreditReplacementForm, DecideReplacementForm } from "@/components/orders/replacement-forms";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { formatQty } from "@/lib/catalog";
import { REPLACEMENT_STATUS_COLOR, REPLACEMENT_STATUS_LABEL } from "@/lib/replacement-core";
import { getT } from "@/lib/i18n/server";
import { lineTotal } from "@/lib/order-core";

export default async function SupplierReplacementPage({ params }: PageProps<"/supplier/replacements/[id]">) {
  const t = await getT();
  const ctx = await requireActiveSupplier();
  const { id } = await params;
  const r = await db.replacement.findUnique({ where: { id }, include: { shop: true, order: true, orderItem: true, courier: true, newOrder: true, productUnit: true } });
  if (!r || r.supplierId !== ctx.supplier.id) notFound();
  const [couriers, orders] = await Promise.all([
    db.supplierMember.findMany({ where: { supplierId: ctx.supplier.id, role: "COURIER", isActive: true }, include: { user: true } }),
    db.order.findMany({ where: { supplierId: ctx.supplier.id, shopId: r.shopId, status: { in: ["PLACED", "ACCEPTED", "ASSEMBLING", "READY", "ASSIGNED"] } }, orderBy: { placedAt: "desc" } }),
  ]);
  const available = Number(r.productUnit.physicalQty) - Number(r.productUnit.reservedQty);
  return (
    <>
      <PageHeader
        title={t("Замена №{n}", { n: r.number })}
        subtitle={<Badge color={REPLACEMENT_STATUS_COLOR[r.status]}>{REPLACEMENT_STATUS_LABEL[r.status]}</Badge>}
        actions={<Link href="/supplier/replacements" className="text-sm text-brand-600">{t("← Все замены")}</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <DefinitionList
            items={[
              ["Товар", `${r.productName} — ${formatQty(r.qty)} ${t(r.unitLabel)}`],
              ["Магазин", <Link key="s" className="text-brand-600" href={`/supplier/shops/${r.shopId}`}>{r.shop.name}</Link>],
              ["Исходный заказ", <Link key="o" className="text-brand-600" href={`/supplier/orders/${r.orderId}`}>№{r.order.number}</Link>],
              ["Причина", t(r.reason)],
              ["Комментарий", r.comment],
              ["Создана", t.dateTime(r.createdAt)],
              ["Решение", r.decisionComment],
              ["Доставщик", r.courier?.fullName ?? (r.newOrder ? t("с заказом №{n}", { n: r.newOrder.number }) : null)],
              ["Выполнена", r.completedAt ? t.dateTime(r.completedAt) : null],
              ["Зачтено в баланс", r.creditedAmount ? t.money(r.creditedAmount) : null],
            ]}
          />
          <Media photos={r.photoPaths} videos={r.videoPaths} />
        </Card>
        <div className="space-y-4">
          {r.status === "NEW" && (
            <Card>
              <h2 className="mb-1 font-semibold">{t("Решение")}</h2>
              <p className="mb-3 text-sm text-gray-500">{t("На складе доступно {qty} {unit}. При согласовании новый товар резервируется.", { qty: formatQty(available), unit: t(r.unitLabel) })}</p>
              <DecideReplacementForm id={r.id} />
            </Card>
          )}
          {(r.status === "APPROVED" || r.status === "ASSIGNED") && (
            <Card>
              <h2 className="mb-3 font-semibold">{t("Кто выполнит замену")}</h2>
              <AssignReplacementForm
                id={r.id}
                couriers={couriers.map((c) => ({ id: c.userId, name: c.user.fullName }))}
                orders={orders.map((o) => ({ id: o.id, label: t("Заказ №{n}", { n: o.number }) }))}
              />
            </Card>
          )}
          {["NEW", "APPROVED", "ASSIGNED"].includes(r.status) && (
            <Card>
              <h2 className="mb-3 font-semibold">{t("Или зачесть в баланс")}</h2>
              <CreditReplacementForm id={r.id} amount={t.money(lineTotal(Number(r.orderItem.price), Number(r.qty)))} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

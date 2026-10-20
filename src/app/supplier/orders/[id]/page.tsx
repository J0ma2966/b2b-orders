import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, DefinitionList, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { OrderHistory, OrderItems, OrderStatusBadge } from "@/components/orders/order-view";
import { AssignCourierForm, ForcedItemForm, OrderStatusForm } from "@/components/orders/supplier-forms";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { formatQty, unitName } from "@/lib/catalog";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { availableSupplierOrderActions, canAssignCourier, canEditForced, CLOSED, PAYMENT_LABEL } from "@/lib/order-core";
import { orderEvents } from "@/lib/orders";
import { SHOP_STATUS_COLOR, SHOP_STATUS_LABEL } from "@/lib/statuses";
import { Badge } from "@/components/ui";
import { removeForcedAction } from "../actions";

export default async function SupplierOrderPage({ params }: PageProps<"/supplier/orders/[id]">) {
  const ctx = await requireActiveSupplier();
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: { shop: true, courier: true, items: { include: { bonusPromotion: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!order || order.supplierId !== ctx.supplier.id || order.status === "DRAFT") notFound();
  const editable = canEditForced(order.status);
  const assignable = canAssignCourier(order.status);
  const [events, couriers, units] = await Promise.all([
    orderEvents(order.id),
    assignable
      ? db.supplierMember.findMany({ where: { supplierId: ctx.supplier.id, role: "COURIER", isActive: true }, include: { user: { include: { _count: { select: { courierOrders: { where: { status: { in: ["ASSIGNED", "IN_TRANSIT"] } } } } } } } } })
      : [],
    editable
      ? db.productUnit.findMany({
          where: { isActive: true, price: { not: null }, product: { supplierId: ctx.supplier.id, archivedAt: null } },
          include: { product: true },
          orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
        })
      : [],
  ]);
  const actions = availableSupplierOrderActions(order.status);
  return (
    <>
      <PageHeader
        title={`Заказ №${order.number}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <span>{formatDateTime(order.placedAt)}</span>
          </span>
        }
        actions={<Link href="/supplier/orders" className="text-sm text-brand-600">← Все заказы</Link>}
      />
      <div className="space-y-4">
        {order.cancelReason && (
          <Alert tone="error">
            {order.cancelledBy === "SHOP" ? "Магазин отменил заказ" : "Заказ отменён поставщиком"} {formatDateTime(order.cancelledAt)}. Причина: {order.cancelReason}
          </Alert>
        )}
        {!CLOSED.includes(order.status) && actions.length > 0 && (
          <Card>
            <OrderStatusForm orderId={order.id} actions={actions} />
          </Card>
        )}
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            <OrderItems
              items={order.items}
              total={order.total}
              action={(i) =>
                editable && i.kind === "FORCED" ? (
                  <form action={removeForcedAction} className="mt-1">
                    <input type="hidden" name="itemId" value={i.id} />
                    <input type="hidden" name="orderId" value={order.id} />
                    <SubmitButton variant="ghost" className="min-h-0 px-0 py-0 text-xs text-red-600" pendingText="…" confirm="Убрать позицию и снять резерв?">Убрать</SubmitButton>
                  </form>
                ) : null
              }
            />
            {editable && (
              <Card>
                <h2 className="mb-1 font-semibold">Принудительная продажа</h2>
                <p className="mb-3 text-sm text-gray-500">Позиция появится в заказе отдельно с отметкой, войдёт в сумму и сразу зарезервируется. Магазин получит уведомление.</p>
                <ForcedItemForm
                  orderId={order.id}
                  units={units.map((u) => ({
                    id: u.id,
                    label: `${u.product.name} — ${unitName(u)}, ${formatMoney(u.price)}`,
                    available: formatQty(Number(u.physicalQty) - Number(u.reservedQty)),
                  }))}
                />
              </Card>
            )}
            <Card>
              <h2 className="mb-3 font-semibold">История</h2>
              <OrderHistory events={events} />
            </Card>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <h2 className="mb-2 flex items-center gap-2 font-semibold">
                {order.shop.name}
                <Badge color={SHOP_STATUS_COLOR[order.shop.status]}>{SHOP_STATUS_LABEL[order.shop.status]}</Badge>
              </h2>
              <DefinitionList
                items={[
                  ["Адрес", order.deliveryAddress],
                  ["Контакт", order.contactName && <>{order.contactName}, <a className="text-brand-600" href={`tel:${order.contactPhone}`}>{formatPhone(order.contactPhone ?? "")}</a></>],
                  ["Желаемая дата", order.deliveryDate ? formatDate(order.deliveryDate) : null],
                  ["Оплата", order.paymentMethod ? PAYMENT_LABEL[order.paymentMethod] : null],
                  ["Комментарий", order.comment],
                  ["Комиссия платформы", order.commissionRate !== null ? `${order.commissionRate.toString()}%` : null],
                ]}
              />
              {order.deliveryLat && order.deliveryLng && (
                <a className="mt-2 inline-block text-sm text-brand-600" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${order.deliveryLat}&mlon=${order.deliveryLng}#map=17/${order.deliveryLat}/${order.deliveryLng}`}>
                  Открыть на карте →
                </a>
              )}
            </Card>
            {(assignable || order.courier) && (
              <Card>
                <h2 className="mb-3 font-semibold">Доставка</h2>
                {assignable ? (
                  <AssignCourierForm
                    orderId={order.id}
                    current={order.courierId}
                    couriers={couriers.map((c) => ({ id: c.userId, name: c.user.fullName, active: c.user._count.courierOrders }))}
                  />
                ) : (
                  <p className="text-sm">{order.courier!.fullName}, {formatPhone(order.courier!.phone)}</p>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

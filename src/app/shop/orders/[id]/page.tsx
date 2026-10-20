import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, DefinitionList, PageHeader } from "@/components/ui";
import { OrderHistory, OrderItems, OrderStatusBadge } from "@/components/orders/order-view";
import { CancelOrderForm } from "@/components/orders/shop-forms";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { PAYMENT_LABEL, shopCanCancel } from "@/lib/order-core";
import { orderEvents } from "@/lib/orders";

export default async function ShopOrderPage({ params, searchParams }: PageProps<"/shop/orders/[id]">) {
  const ctx = await requireShop();
  const { id } = await params;
  const sp = await searchParams;
  const order = await db.order.findUnique({
    where: { id },
    include: { supplier: true, courier: true, items: { include: { bonusPromotion: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!order || order.shopId !== ctx.shop.id || order.status === "DRAFT") notFound();
  const events = await orderEvents(order.id);
  const placedEvent = events.find((e) => e.fromStatus === "DRAFT");
  return (
    <>
      <PageHeader
        title={`Заказ №${order.number}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <Link href={`/shop/suppliers/${order.supplierId}`} className="text-brand-600">{order.supplier.displayName}</Link>
          </span>
        }
      />
      <div className="space-y-4">
        {sp.placed && <Alert tone="success">Заказ оформлен, товар зарезервирован. Поставщик получил уведомление.</Alert>}
        {sp.placed && placedEvent?.comment && <Alert tone="warning">{placedEvent.comment}</Alert>}
        {order.cancelReason && (
          <Alert tone="error">
            {order.cancelledBy === "SHOP" ? "Вы отменили заказ" : "Поставщик отменил заказ"} {formatDateTime(order.cancelledAt)}. Причина: {order.cancelReason}
          </Alert>
        )}
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            <OrderItems items={order.items} total={order.total} />
            <Card>
              <h2 className="mb-3 font-semibold">История</h2>
              <OrderHistory events={events} />
            </Card>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <DefinitionList
                items={[
                  ["Оформлен", formatDateTime(order.placedAt)],
                  ["Оплата", order.paymentMethod ? PAYMENT_LABEL[order.paymentMethod] : null],
                  ["Адрес", order.deliveryAddress],
                  ["Контакт", order.contactName && `${order.contactName}, ${formatPhone(order.contactPhone ?? "")}`],
                  ["Желаемая дата", order.deliveryDate ? formatDate(order.deliveryDate) : null],
                  ["Доставщик", order.courier ? <>{order.courier.fullName}, <a className="text-brand-600" href={`tel:${order.courier.phone}`}>{formatPhone(order.courier.phone)}</a></> : null],
                  ["Комментарий", order.comment],
                ]}
              />
            </Card>
            {shopCanCancel(order.status) && (
              <Card>
                <h2 className="mb-3 font-semibold">Отмена заказа</h2>
                <CancelOrderForm orderId={order.id} />
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

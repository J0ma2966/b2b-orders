import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, DefinitionList, PageHeader } from "@/components/ui";
import QRCode from "qrcode";
import { OrderFinance, OrderHistory, OrderItems, OrderStatusBadge } from "@/components/orders/order-view";
import { CancelOrderForm, ConfirmReceiptQr, RepeatOrderForm, RequestCancelForm } from "@/components/orders/shop-forms";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";
import { formatPhone } from "@/lib/phone";
import { CLOSED, PAYMENT_LABEL, RECEIVED, shopCanCancel, shopCanRequestCancel } from "@/lib/order-core";
import { orderEvents } from "@/lib/orders";
import { isTracked, OrderTracker } from "@/components/shop/order-tracker";

export default async function ShopOrderPage({ params, searchParams }: PageProps<"/shop/orders/[id]">) {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  const { id } = await params;
  const sp = await searchParams;
  const order = await db.order.findUnique({
    where: { id },
    include: { supplier: true, courier: true, items: { include: { bonusPromotion: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!order || order.shopId !== ctx.shop.id || order.status === "DRAFT") notFound();
  const events = await orderEvents(order.id);
  const placedEvent = events.find((e) => e.fromStatus === "DRAFT");
  const qr = order.status === "IN_TRANSIT" && order.qrToken && !order.qrUsedAt ? await QRCode.toDataURL(`B2B-ORDER:${order.qrToken}`, { width: 512, margin: 1 }) : null;
  const owner = ctx.membership.role === "OWNER";
  // Общий долг перед поставщиком сотруднику не показываем (М6)
  const account = owner && RECEIVED.includes(order.status) ? await db.shopAccount.findUnique({ where: { shopId_supplierId: { shopId: order.shopId, supplierId: order.supplierId } } }) : null;
  return (
    <>
      <PageHeader
        title={t("Заказ №{n}", { n: order.number })}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <Link href={`/shop/suppliers/${order.supplierId}`} className="text-brand-600">{order.supplier.displayName}</Link>
          </span>
        }
      />
      <div className="space-y-4">
        {sp.placed && <Alert tone="success">{t("Заказ оформлен, товар зарезервирован. Поставщик получил уведомление.")}</Alert>}
        {sp.placed && placedEvent?.comment && <Alert tone="warning">{placedEvent.comment}</Alert>}
        {order.cancelReason && (
          <Alert tone="error">
            {t(order.cancelledBy === "SHOP" ? "Вы отменили заказ {date}. Причина: {reason}" : order.cancelledBy === "PLATFORM" ? "Заказ отменён автоматически {date}. Причина: {reason}" : "Поставщик отменил заказ {date}. Причина: {reason}", { date: t.dateTime(order.cancelledAt), reason: order.cancelReason })}
          </Alert>
        )}
        {order.status === "NEEDS_CONFIRMATION" && <Alert tone="warning">{t("Вы попросили отменить заказ: {reason}. Ждём решения поставщика.", { reason: order.cancelRequestReason })}</Alert>}
        {order.status === "NOT_DELIVERED" && order.problemNote && <Alert tone="error">{t("Заказ не доставлен: {note}", { note: order.problemNote })}</Alert>}
        {isTracked(order.status) && (
          <Card className="sm:py-5">
            <OrderTracker status={order.status} />
          </Card>
        )}
        {qr && (
          <Card className="ring-2 ring-accent">
            <ConfirmReceiptQr dataUrl={qr} code={order.qrToken!} />
          </Card>
        )}
        {RECEIVED.includes(order.status) && (
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-full bg-surface px-4 py-2 text-sm font-medium ring-1 ring-black/10 hover:ring-brand-500" href={`/documents/orders/${order.id}/receipt`}>{t("🧾 Чек")}</Link>
            <Link className="rounded-full bg-surface px-4 py-2 text-sm font-medium ring-1 ring-black/10 hover:ring-brand-500" href={`/documents/orders/${order.id}/invoice`}>{t("📄 Накладная")}</Link>
            <Link className="rounded-full bg-surface px-4 py-2 text-sm font-medium ring-1 ring-black/10 hover:ring-brand-500" href={`/shop/replacements/new?order=${order.id}`}>{t("🔁 Заявка на замену")}</Link>
          </div>
        )}
        {CLOSED.includes(order.status) && <RepeatOrderForm orderId={order.id} />}
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            <OrderItems items={order.items} total={order.total} />
            <OrderFinance o={order} currentBalance={account ? Number(account.balance) : undefined} />
            <Card>
              <h2 className="mb-3 font-semibold">{t("История")}</h2>
              <OrderHistory events={events} />
            </Card>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <DefinitionList
                items={[
                  ["Оформлен", t.dateTime(order.placedAt)],
                  ["Оплата", order.paymentMethod ? t(PAYMENT_LABEL[order.paymentMethod]) : null],
                  ["Адрес", order.deliveryAddress],
                  ["Контакт", order.contactName && `${order.contactName}, ${formatPhone(order.contactPhone ?? "")}`],
                  ["Желаемая дата", order.deliveryDate ? t.date(order.deliveryDate) : null],
                  ["Доставщик", order.courier ? <>{order.courier.fullName}, <a className="text-brand-600" href={`tel:${order.courier.phone}`}>{formatPhone(order.courier.phone)}</a></> : null],
                  ["Комментарий", order.comment],
                ]}
              />
            </Card>
            {owner && shopCanRequestCancel(order.status) && (
              <Card>
                <h2 className="mb-3 font-semibold">{t("Отмена заказа")}</h2>
                <RequestCancelForm orderId={order.id} />
              </Card>
            )}
            {owner && shopCanCancel(order.status) && (
              <Card>
                <h2 className="mb-3 font-semibold">{t("Отмена заказа")}</h2>
                <CancelOrderForm
 orderId={order.id} />
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

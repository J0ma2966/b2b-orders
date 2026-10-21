import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card } from "@/components/ui";
import { DeliveryActions, DeliveryItems, OtherMapLinks } from "@/components/orders/delivery-card";
import { OrderStatusBadge } from "@/components/orders/order-view";
import { formatPhone } from "@/lib/phone";
import { AcceptanceForm, ProblemForm, StartDeliveryForm } from "@/components/orders/courier-forms";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { allowsFraction, RECEIVED } from "@/lib/order-core";
import { getT } from "@/lib/i18n/server";
import { accountState } from "@/lib/accounts";

export default async function CourierOrderPage({ params }: PageProps<"/courier/orders/[id]">) {
  const t = await getT();
  const ctx = await requireSupplier(["COURIER"]);
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: { shop: true, items: { include: { productUnit: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!order || order.courierId !== ctx.auth.user.id || order.supplierId !== ctx.supplier.id) notFound();
  const { balance, terms } = await accountState(db, order.shopId, order.supplierId);
  return (
    <>
      <Link href="/courier" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-ink">{t("← Все доставки")}</Link>
      <div className="mb-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-sm font-semibold text-gray-500">{t("Доставка №{n}", { n: order.number })}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="mt-1 text-2xl leading-tight font-bold">{order.shop.name}</p>
        <p className="mt-1 text-lg leading-snug text-gray-700">{order.deliveryAddress}</p>
        {order.contactName && (
          <p className="mt-1 text-sm text-gray-500">
            {order.contactName}
            {order.contactPhone && `, ${formatPhone(order.contactPhone)}`}
          </p>
        )}
      </div>
      <div className="space-y-4">
        <DeliveryActions o={order} />
        <OtherMapLinks lat={order.deliveryLat} lng={order.deliveryLng} />
        {order.comment && <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">💬 {order.comment}</p>}
        {order.status === "ASSIGNED" && <StartDeliveryForm orderId={order.id} />}
        {order.status === "NEEDS_CONFIRMATION" && <Alert tone="warning">{t("Магазин просит отменить заказ: {reason}. Дождитесь решения поставщика.", { reason: order.cancelRequestReason })}</Alert>}
        {order.status === "DELIVERY_PROBLEM" && <Alert tone="warning">{t("Вы сообщили о проблеме: {note}. Ждём решения поставщика.", { note: order.problemNote })}</Alert>}
        {RECEIVED.includes(order.status) && (
          <Alert tone="success">
            {t("Получение подтверждено. Сумма {total}, получено {received}.", { total: t.money(order.total), received: t.money(order.receivedAmount) })}{" "}
            <Link className="underline" href={`/documents/orders/${order.id}/receipt`}>{t("Чек")}</Link> · <Link className="underline" href={`/documents/orders/${order.id}/invoice`}>{t("Накладная")}</Link>
          </Alert>
        )}
        {order.status === "IN_TRANSIT" ? (
          <AcceptanceForm
            orderId={order.id}
            balanceBefore={balance}
            terms={terms}
            items={order.items.map((i) => ({
              id: i.id,
              name: i.productName,
              unitLabel: i.unitLabel,
              kind: i.kind,
              qty: Number(i.qty),
              price: Number(i.price),
              step: allowsFraction(i.productUnit.kind) ? "0.001" : "1",
            }))}
          />
        ) : (
          <Card>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{t("Что везти")}</h2>
              <span className="text-lg font-bold tabular-nums">{t.money(order.total)}</span>
            </div>
            <DeliveryItems items={order.items} />
          </Card>
        )}
        {(order.status === "IN_TRANSIT" || order.status === "DELIVERY_PROBLEM") && (
          <div className="pt-2">
            <ProblemForm orderId={order.id} allowNotDelivered />
          </div>
        )}
      </div>
    </>
  );
}

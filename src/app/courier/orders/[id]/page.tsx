import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, PageHeader } from "@/components/ui";
import { DeliveryCard } from "@/components/orders/delivery-card";
import { AcceptanceForm, ProblemForm, StartDeliveryForm } from "@/components/orders/courier-forms";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { allowsFraction, RECEIVED } from "@/lib/order-core";
import { getT } from "@/lib/i18n/server";

export default async function CourierOrderPage({ params }: PageProps<"/courier/orders/[id]">) {
  const t = await getT();
  const ctx = await requireSupplier(["COURIER"]);
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: { shop: true, items: { include: { productUnit: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!order || order.courierId !== ctx.auth.user.id || order.supplierId !== ctx.supplier.id) notFound();
  const account = await db.shopAccount.findUnique({ where: { shopId_supplierId: { shopId: order.shopId, supplierId: order.supplierId } } });
  const balance = Number(account?.balance ?? 0);
  return (
    <>
      <PageHeader title={t("Доставка №{n}", { n: order.number })} actions={<Link href="/courier" className="text-sm text-brand-600">{t("← Все доставки")}</Link>} />
      <div className="space-y-4">
        <DeliveryCard o={order} />
        {order.status === "ASSIGNED" && <StartDeliveryForm orderId={order.id} />}
        {order.status === "NEEDS_CONFIRMATION" && <Alert tone="warning">{t("Магазин просит отменить заказ: {reason}. Дождитесь решения поставщика.", { reason: order.cancelRequestReason })}</Alert>}
        {order.status === "DELIVERY_PROBLEM" && <Alert tone="warning">{t("Вы сообщили о проблеме: {note}. Ждём решения поставщика.", { note: order.problemNote })}</Alert>}
        {order.status === "IN_TRANSIT" && (
          <Card>
            <h2 className="mb-3 font-semibold">{t("Приёмка и оплата")}</h2>
            <AcceptanceForm
              orderId={order.id}
              balanceBefore={balance}
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
          </Card>
        )}
        {(order.status === "IN_TRANSIT" || order.status === "DELIVERY_PROBLEM") && (
          <Card>
            <ProblemForm orderId={order.id} allowNotDelivered />
          </Card>
        )}
        {RECEIVED.includes(order.status) && (
          <Alert tone="success">
            {t("Получение подтверждено. Сумма {total}, получено {received}.", { total: t.money(order.total), received: t.money(order.receivedAmount) })}{" "}
            <Link className="underline" href={`/documents/orders/${order.id}/receipt`}>{t("Чек")}</Link> · <Link className="underline" href={`/documents/orders/${order.id}/invoice`}>{t("Накладная")}</Link>
          </Alert>
        )}
      </div>
    </>
  );
}

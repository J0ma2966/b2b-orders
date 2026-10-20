import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, PageHeader } from "@/components/ui";
import { DeliveryCard } from "@/components/orders/delivery-card";
import { AcceptanceForm, ProblemForm, StartDeliveryForm } from "@/components/orders/courier-forms";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { formatMoney } from "@/lib/format";
import { allowsFraction, RECEIVED } from "@/lib/order-core";

export default async function CourierOrderPage({ params }: PageProps<"/courier/orders/[id]">) {
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
      <PageHeader title={`Доставка №${order.number}`} actions={<Link href="/courier" className="text-sm text-brand-600">← Все доставки</Link>} />
      <div className="space-y-4">
        <DeliveryCard o={order} />
        {order.status === "ASSIGNED" && <StartDeliveryForm orderId={order.id} />}
        {order.status === "NEEDS_CONFIRMATION" && <Alert tone="warning">Магазин просит отменить заказ: {order.cancelRequestReason}. Дождитесь решения поставщика.</Alert>}
        {order.status === "DELIVERY_PROBLEM" && <Alert tone="warning">Вы сообщили о проблеме: {order.problemNote}. Ждём решения поставщика.</Alert>}
        {order.status === "IN_TRANSIT" && (
          <Card>
            <h2 className="mb-3 font-semibold">Приёмка и оплата</h2>
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
            Получение подтверждено. Сумма {formatMoney(order.total)}, получено {formatMoney(order.receivedAmount)}.{" "}
            <Link className="underline" href={`/documents/orders/${order.id}/receipt`}>Чек</Link> · <Link className="underline" href={`/documents/orders/${order.id}/invoice`}>Накладная</Link>
          </Alert>
        )}
      </div>
    </>
  );
}

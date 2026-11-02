import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, DefinitionList, PageHeader } from "@/components/ui";
import { OrderHistory, OrderItems, OrderStatusBadge } from "@/components/orders/order-view";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { formatPhone } from "@/lib/phone";
import { PAYMENT_LABEL } from "@/lib/order-core";
import { orderEvents } from "@/lib/orders";
import { getT } from "@/lib/i18n/server";

// Просмотр заказа платформой. Действовать за поставщика — через «Действие от имени».
export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const t = await getT();
  await requireSuperAdmin();
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: { shop: true, supplier: true, courier: true, items: { include: { bonusPromotion: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!order || order.status === "DRAFT") notFound();
  const events = await orderEvents(order.id);
  const commission = order.commissionRate !== null ? (Number(order.total) * Number(order.commissionRate)) / 100 : null;
  return (
    <>
      <PageHeader title={`Заказ №${order.number}`} subtitle={<OrderStatusBadge status={order.status} />} actions={<Link href="/admin/orders" className="text-sm text-brand-600">{t("← Все заказы")}</Link>} />
      <div className="space-y-4">
        {order.cancelReason && <Alert tone="error">{t(order.cancelledBy === "SHOP" ? "Отменён магазином {date}: {reason}" : order.cancelledBy === "PLATFORM" ? "Отменён автоматически {date}: {reason}" : "Отменён поставщиком {date}: {reason}", { date: t.dateTime(order.cancelledAt), reason: order.cancelReason })}</Alert>}
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            <OrderItems items={order.items} total={order.total} />
            <Card>
              <h2 className="mb-3 font-semibold">{t("История")}</h2>
              <OrderHistory events={events} />
            </Card>
          </div>
          <Card className="lg:col-span-2">
            <DefinitionList
              items={[
                ["Поставщик", <Link key="s" href={`/admin/suppliers/${order.supplierId}`} className="text-brand-600">{order.supplier.displayName}</Link>],
                ["Магазин", <Link key="m" href={`/admin/shops/${order.shopId}`} className="text-brand-600">{order.shop.name}</Link>],
                ["Оформлен", t.dateTime(order.placedAt)],
                ["Оплата", order.paymentMethod ? t(PAYMENT_LABEL[order.paymentMethod]) : null],
                ["Адрес", order.deliveryAddress],
                ["Контакт", order.contactName && `${order.contactName}, ${formatPhone(order.contactPhone ?? "")}`],
                ["Желаемая дата", order.deliveryDate ? t.date(order.deliveryDate) : null],
                ["Доставщик", order.courier ? t.person(order.courier.fullName) : null],
                ["Ставка комиссии", order.commissionRate !== null ? `${order.commissionRate.toString()}%` : null],
                ["Расчётная комиссия", commission !== null ? t.money(commission) : null],
              ]}
            />
          </Card>
        </div>
      </div>
    </>
  );
}

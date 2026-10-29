import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, DefinitionList, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { OrderFinance, OrderHistory, OrderItems, OrderStatusBadge } from "@/components/orders/order-view";
import { AssignCourierForm, CancelRequestDecisionForm, CorrectionForm, ForcedItemForm, OrderStatusForm, ReadyAndAssignForm, ResolveProblemForm } from "@/components/orders/supplier-forms";
import { paymentDue } from "@/lib/accounts";
import { fileUrl } from "@/lib/storage";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { formatQty, unitName } from "@/lib/catalog";
import { formatPhone } from "@/lib/phone";
import { availableSupplierOrderActions, canAssignCourier, canEditForced, CLOSED, PAYMENT_LABEL, RECEIVED } from "@/lib/order-core";
import { orderEvents, suggestedCourier } from "@/lib/orders";
import { SHOP_STATUS_COLOR, SHOP_STATUS_LABEL } from "@/lib/statuses";
import { Badge } from "@/components/ui";
import { removeForcedAction } from "../actions";
import { getT } from "@/lib/i18n/server";
import { delivererWhere } from "@/lib/supplier-roles";

export default async function SupplierOrderPage({ params }: PageProps<"/supplier/orders/[id]">) {
  const t = await getT();
  const ctx = await requireActiveSupplier();
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: { shop: true, courier: true, items: { include: { bonusPromotion: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!order || order.supplierId !== ctx.supplier.id || order.status === "DRAFT") notFound();
  const editable = canEditForced(order.status);
  const assignable = canAssignCourier(order.status);
  const quickReady = ctx.supplier.skipAssembly && (order.status === "ACCEPTED" || order.status === "ASSEMBLING");
  const [events, couriers, units] = await Promise.all([
    orderEvents(order.id),
    assignable || quickReady
      ? db.supplierMember.findMany({ where: { supplierId: ctx.supplier.id, ...delivererWhere }, include: { user: { include: { _count: { select: { courierOrders: { where: { status: { in: ["ASSIGNED", "IN_TRANSIT"] } } } } } } } } })
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
  const received = RECEIVED.includes(order.status);
  const account = await db.shopAccount.findUnique({ where: { shopId_supplierId: { shopId: order.shopId, supplierId: order.supplierId } } });
  const open = !CLOSED.includes(order.status);
  const [due, suggested] = await Promise.all([
    open ? paymentDue(db, { id: order.id, shopId: order.shopId, supplierId: order.supplierId, total: Number(order.total), placedAt: order.placedAt }) : null,
    assignable || quickReady ? suggestedCourier(ctx.supplier.id, order.shop.territoryId) : null,
  ]);
  // Сам поставщик, если развозит, — первым в списке
  const courierOptions = couriers
    .map((c) => ({ id: c.userId, name: c.user.fullName, active: c.user._count.courierOrders, me: c.userId === ctx.auth.user.id }))
    .sort((a, b) => Number(b.me) - Number(a.me));
  const myDelivery = order.courierId === ctx.auth.user.id && ["ASSIGNED", "IN_TRANSIT", "DELIVERY_PROBLEM"].includes(order.status);
  return (
    <>
      <PageHeader
        title={t("Заказ №{n}", { n: order.number })}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <span>{t.dateTime(order.placedAt)}</span>
          </span>
        }
        actions={<Link href="/supplier/orders" className="text-sm text-brand-600">{t("← Все заказы")}</Link>}
      />
      <div className="space-y-4">
        {order.cancelReason && (
          <Alert tone="error">
            {t(order.cancelledBy === "SHOP" ? "Магазин отменил заказ {date}. Причина: {reason}" : order.cancelledBy === "PLATFORM" ? "Заказ отменён автоматически {date}. Причина: {reason}" : "Заказ отменён поставщиком {date}. Причина: {reason}", { date: t.dateTime(order.cancelledAt), reason: order.cancelReason })}
          </Alert>
        )}
        {order.status === "NEEDS_CONFIRMATION" && (
          <Card><CancelRequestDecisionForm orderId={order.id} reason={order.cancelRequestReason ?? ""} /></Card>
        )}
        {due && due.overLimit > 0 && (
          <Alert tone="warning">{t("Заказ выше кредитного лимита магазина на {sum}. При доставке нужно получить не менее {required}.", { sum: t.money(due.overLimit), required: t.money(due.required) })}</Alert>
        )}
        {due && due.aging && due.aging.overdueAmount > 0 && (
          <Alert tone="error">{t("У магазина просрочен долг {sum} ({days} дн.). Заказ нужно получить полностью: {required}.", { sum: t.money(due.aging.overdueAmount), days: due.aging.overdueDays, required: t.money(due.required) })}</Alert>
        )}
        {order.status === "DELIVERY_PROBLEM" && (
          <Card><ResolveProblemForm orderId={order.id} note={order.problemNote ?? ""} /></Card>
        )}
        {order.problemPhotoPaths.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {order.problemPhotoPaths.map((p) => (
              <a key={p} href={fileUrl(p) ?? "#"} target="_blank" rel="noreferrer">
                <img src={fileUrl(p) ?? ""} alt="" className="size-24 rounded-lg object-cover ring-1 ring-gray-200" />
              </a>
            ))}
          </div>
        )}
        {order.status === "NOT_DELIVERED" && order.problemNote && <Alert tone="error">{t("Не доставлен: {note}", { note: order.problemNote })}</Alert>}
        {received && (
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-gray-300" href={`/documents/orders/${order.id}/receipt`}>{t("🧾 Чек")}</Link>
            <Link className="rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-gray-300" href={`/documents/orders/${order.id}/invoice`}>{t("📄 Накладная")}</Link>
            <Link className="rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-gray-300" href={`/supplier/shops/${order.shopId}`}>{t("💰 Счёт магазина")}</Link>
          </div>
        )}
        {open && actions.length > 0 && (
          <Card className="space-y-3">
            {quickReady && <ReadyAndAssignForm orderId={order.id} couriers={courierOptions} suggested={suggested} />}
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
                    <SubmitButton variant="ghost" className="min-h-0 px-0 py-0 text-xs text-red-600" pendingText="…" confirm="Убрать позицию и снять резерв?">{t("Убрать")}</SubmitButton>
                  </form>
                ) : null
              }
            />
            <OrderFinance o={order} currentBalance={account ? Number(account.balance) : undefined} />
            {received && (
              <Card>
                <h2 className="mb-1 font-semibold">{t("Корректирующая операция")}</h2>
                <p className="mb-3 text-sm text-gray-500">{t("Полученный заказ не редактируется. Исправление суммы записывается отдельной операцией и меняет задолженность магазина (ТЗ п. 65–66).")}</p>
                <CorrectionForm orderId={order.id} shopId={order.shopId} />
              </Card>
            )}
            {editable && (
              <Card>
                <h2 className="mb-1 font-semibold">{t("Принудительная продажа")}</h2>
                <p className="mb-3 text-sm text-gray-500">{t("Позиция появится в заказе отдельно с отметкой, войдёт в сумму и сразу зарезервируется. Магазин получит уведомление.")}</p>
                <ForcedItemForm
                  orderId={order.id}
                  units={units.map((u) => ({
                    id: u.id,
                    label: `${u.product.name} — ${t(unitName(u))}, ${t.money(u.price)}`,
                    available: formatQty(Number(u.physicalQty) - Number(u.reservedQty)),
                  }))}
                />
              </Card>
            )}
            <Card>
              <h2 className="mb-3 font-semibold">{t("История")}</h2>
              <OrderHistory events={events} />
            </Card>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <h2 className="mb-2 flex items-center gap-2 font-semibold">
                <Link href={`/supplier/shops/${order.shopId}`} className="hover:underline">{order.shop.name}</Link>
                <Badge color={SHOP_STATUS_COLOR[order.shop.status]}>{SHOP_STATUS_LABEL[order.shop.status]}</Badge>
              </h2>
              <DefinitionList
                items={[
                  ["Адрес", order.deliveryAddress],
                  ["Контакт", order.contactName && <>{order.contactName}, <a className="text-brand-600" href={`tel:${order.contactPhone}`}>{formatPhone(order.contactPhone ?? "")}</a></>],
                  ["Дата доставки", order.deliveryDate ? t.date(order.deliveryDate) : null],
                  ["К оплате при получении", due ? t.money(due.required) : null],
                  ["Оплата", order.paymentMethod ? t(PAYMENT_LABEL[order.paymentMethod]) : null],
                  ["Комментарий", order.comment],
                  ["Комиссия платформы", order.commissionRate !== null ? `${order.commissionRate.toString()}%` : null],
                ]}
              />
              {order.deliveryLat && order.deliveryLng && (
                <a className="mt-2 inline-block text-sm text-brand-600" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${order.deliveryLat}&mlon=${order.deliveryLng}#map=17/${order.deliveryLat}/${order.deliveryLng}`}>
                  {t("Открыть на карте →")}
                </a>
              )}
            </Card>
            {(assignable || order.courier) && (
              <Card>
                <h2 className="mb-3 font-semibold">{t("Доставка")}</h2>
                {assignable ? (
                  <AssignCourierForm orderId={order.id} current={order.courierId} suggested={suggested} couriers={courierOptions} />
                ) : (
                  <p className="text-sm">{order.courier!.fullName}, {formatPhone(order.courier!.phone)}</p>
                )}
                {myDelivery && (
                  <Link href={`/courier/orders/${order.id}`} className="mt-3 inline-block text-sm font-medium text-brand-600">
                    {t("Везу сам: открыть в приложении доставки →")}
                  </Link>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

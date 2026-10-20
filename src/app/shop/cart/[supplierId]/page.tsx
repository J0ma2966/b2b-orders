import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { CartQtyForm, CheckoutForm } from "@/components/orders/shop-forms";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { formatQty } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { allowsFraction, lineTotal } from "@/lib/order-core";
import { previewBonuses } from "@/lib/orders";
import { supplierForShop } from "@/lib/shop-catalog";

export default async function CartPage({ params }: PageProps<"/shop/cart/[supplierId]">) {
  const ctx = await requireShop();
  const { supplierId } = await params;
  const supplier = await supplierForShop(ctx.shop.territoryId, supplierId);
  if (!supplier) notFound();
  const cart = await db.order.findFirst({
    where: { shopId: ctx.shop.id, supplierId, status: "DRAFT" },
    include: { items: { include: { productUnit: { include: { product: true } } }, orderBy: { createdAt: "asc" } } },
  });
  const items = cart?.items ?? [];
  const bonuses = items.length > 0 ? await previewBonuses(supplierId, items) : [];
  const owner = await db.user.findFirst({ where: { shopMembers: { some: { shopId: ctx.shop.id, role: "OWNER" } } } });
  const blocked = ctx.shop.isBlocked || supplier.ordersDisabled;
  return (
    <>
      <PageHeader
        title="Корзина"
        subtitle={<Link href={`/shop/suppliers/${supplier.id}`} className="text-brand-600">← {supplier.displayName}</Link>}
      />
      {items.length === 0 ? (
        <EmptyState>
          В корзине пока ничего нет. <Link href={`/shop/suppliers/${supplier.id}`} className="text-brand-600">Перейти в каталог</Link>
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            <Card className="p-0 sm:p-0">
              <ul className="divide-y divide-gray-100">
                {items.map((i) => {
                  const u = i.productUnit;
                  const available = Number(u.physicalQty) - Number(u.reservedQty);
                  const gone = !u.isActive || u.price === null || !!u.product.archivedAt || !u.product.isAvailable;
                  const priceChanged = !gone && !u.price!.equals(i.price);
                  return (
                    <li key={i.id} className="space-y-2 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">{i.productName}</div>
                          <div className="text-xs text-gray-500">{formatMoney(gone ? i.price : u.price)} / {i.unitLabel} · в наличии {formatQty(Math.max(0, available))}</div>
                        </div>
                        <div className="shrink-0 text-sm font-medium">{formatMoney(lineTotal(Number(gone ? i.price : u.price), Number(i.qty)))}</div>
                      </div>
                      {gone && <p className="text-xs text-red-600">Товар больше не продаётся, при оформлении он будет убран</p>}
                      {priceChanged && <p className="text-xs text-yellow-700">Цена изменилась: было {formatMoney(i.price)}</p>}
                      {!gone && Number(i.qty) > available && <p className="text-xs text-red-600">Доступно меньше, чем в корзине</p>}
                      <CartQtyForm itemId={i.id} qty={String(Number(i.qty))} step={allowsFraction(u.kind) ? "0.001" : "1"} />
                    </li>
                  );
                })}
              </ul>
            </Card>
            {bonuses.length > 0 && (
              <Alert tone="success">
                <p className="font-medium">Подарки по акциям:</p>
                <ul className="mt-1 list-disc pl-5">
                  {bonuses.map((b) => (
                    <li key={b.promotionId}>
                      {b.name} — {formatQty(b.qty)} {b.unitLabel} ({b.promotion})
                      {b.qty < b.entitled && ` · положено ${formatQty(b.entitled)}, в наличии меньше`}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">Окончательно подарки рассчитываются при оформлении.</p>
              </Alert>
            )}
          </div>
          <div className="lg:col-span-2">
            <Card>
              <div className="mb-4 flex justify-between text-lg font-semibold">
                <span>Итого</span>
                <span>{formatMoney(items.reduce((s, i) => s + lineTotal(Number(i.productUnit.price ?? i.price), Number(i.qty)), 0))}</span>
              </div>
              {blocked ? (
                <Alert tone="warning">{ctx.shop.isBlocked ? "Магазин заблокирован, оформление заказов недоступно." : "Поставщик временно не принимает заказы."}</Alert>
              ) : (
                <CheckoutForm
                  supplierId={supplier.id}
                  defaults={{ address: ctx.shop.address, contactName: ctx.shop.contactName, contactPhone: formatPhone(ctx.shop.phone ?? owner?.phone ?? "") }}
                />
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

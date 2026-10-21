import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { CartQtyForm, CheckoutForm } from "@/components/orders/shop-forms";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { formatQty } from "@/lib/catalog";
import { getT } from "@/lib/i18n/server";
import { formatPhone } from "@/lib/phone";
import { allowsFraction, isoWeekday, lineTotal, WEEKDAY_SHORT } from "@/lib/order-core";
import { paymentDue } from "@/lib/accounts";
import { supplierTermsForShop } from "@/lib/supplier-terms";
import { previewBonuses } from "@/lib/orders";
import { supplierForShop } from "@/lib/shop-catalog";

export default async function CartPage({ params }: PageProps<"/shop/cart/[supplierId]">) {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
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
  const total = items.reduce((s, i) => s + lineTotal(Number(i.productUnit.price ?? i.price), Number(i.qty)), 0);
  const [due, terms, sup] = await Promise.all([
    paymentDue(db, { shopId: ctx.shop.id, supplierId, total }),
    supplierTermsForShop(db, supplierId, ctx.shop.territoryId),
    db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { creditOverLimitBlock: true } }),
  ]);
  const belowMin = terms.minOrderTotal !== null && total < terms.minOrderTotal;
  const overBlocked = sup.creditOverLimitBlock && due.overLimit > 0;
  const dates = terms.restrictsDates
    ? terms.dates().map((d) => ({ value: d.toISOString().slice(0, 10), label: `${t(WEEKDAY_SHORT[isoWeekday(d) - 1])}, ${t.date(d)}` }))
    : undefined;
  return (
    <>
      <PageHeader
        title="Корзина"
        subtitle={<Link href={`/shop/suppliers/${supplier.id}`} className="text-brand-600">← {supplier.displayName}</Link>}
      />
      {items.length === 0 ? (
        <EmptyState>
          {t("В корзине пока ничего нет.")} <Link href={`/shop/suppliers/${supplier.id}`} className="text-brand-600">{t("Перейти в каталог")}</Link>
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
                          <div className="text-xs text-gray-500">{t.money(gone ? i.price : u.price)} / {t(i.unitLabel)} · {t("в наличии {qty}", { qty: formatQty(Math.max(0, available)) })}</div>
                        </div>
                        <div className="shrink-0 text-sm font-medium">{t.money(lineTotal(Number(gone ? i.price : u.price), Number(i.qty)))}</div>
                      </div>
                      {gone && <p className="text-xs text-red-600">{t("Товар больше не продаётся, при оформлении он будет убран")}</p>}
                      {priceChanged && <p className="text-xs text-yellow-700">{t("Цена изменилась: было {price}", { price: t.money(i.price) })}</p>}
                      {!gone && Number(i.qty) > available && <p className="text-xs text-red-600">{t("Доступно меньше, чем в корзине")}</p>}
                      <CartQtyForm itemId={i.id} qty={String(Number(i.qty))} step={allowsFraction(u.kind) ? "0.001" : "1"} />
                    </li>
                  );
                })}
              </ul>
            </Card>
            {bonuses.length > 0 && (
              <Alert tone="success">
                <p className="font-medium">{t("Подарки по акциям:")}</p>
                <ul className="mt-1 list-disc pl-5">
                  {bonuses.map((b) => (
                    <li key={b.promotionId}>
                      {b.name} — {formatQty(b.qty)} {t(b.unitLabel)} ({b.promotion})
                      {b.qty < b.entitled && ` · ${t("положено {qty}, в наличии меньше", { qty: formatQty(b.entitled) })}`}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">{t("Окончательно подарки рассчитываются при оформлении.")}</p>
              </Alert>
            )}
          </div>
          <div className="lg:col-span-2">
            <Card>
              <div className="mb-4 flex justify-between text-lg font-semibold">
                <span>{t("Итого")}</span>
                <span>{t.money(total)}</span>
              </div>
              <PaymentSummary due={due} t={t} />
              {belowMin && <div className="mb-4"><Alert tone="warning">{t("Минимальная сумма заказа у этого поставщика — {sum}", { sum: t.money(terms.minOrderTotal) })}</Alert></div>}
              {overBlocked && <div className="mb-4"><Alert tone="error">{t("Заказ превышает доступный кредит на {sum}. Уменьшите заказ или погасите долг", { sum: t.money(due.overLimit) })}</Alert></div>}
              {blocked ? (
                <Alert tone="warning">{ctx.shop.isBlocked ? t("Магазин заблокирован, оформление заказов недоступно.") : t("Поставщик временно не принимает заказы.")}</Alert>
              ) : (
                <CheckoutForm
                  supplierId={supplier.id}
                  dates={dates}
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

// М2, Л1, Л3: долг, остаток кредита и сколько нужно будет оплатить при получении
function PaymentSummary({ due, t }: { due: Awaited<ReturnType<typeof paymentDue>>; t: Awaited<ReturnType<typeof getT>> }) {
  const rows: [string, string][] = [];
  if (due.balance > 0) rows.push([t("Ваш долг поставщику"), t.money(due.balance)]);
  if (due.balance < 0) rows.push([t("Ваша предоплата"), t.money(-due.balance)]);
  if (due.ahead > 0) rows.push([t("Заказы в пути"), t.money(due.ahead)]);
  if (due.terms.creditAllowed && !due.terms.overdue) rows.push([t("Можно ещё в долг"), due.creditLeft === null ? t("без лимита") : t.money(due.creditLeft)]);
  return (
    <div className="mb-4 space-y-2">
      {rows.length > 0 && (
        <dl className="space-y-1 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-gray-500">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {due.aging && due.aging.overdueAmount > 0 ? (
        <Alert tone="error">
          {t("Долг {sum} просрочен на {days} дн. Пока он не погашен, заказ нужно оплатить полностью при получении.", { sum: t.money(due.aging.overdueAmount), days: due.aging.overdueDays })}
        </Alert>
      ) : due.aging ? (
        <p className="text-xs text-gray-500">{t("Долг нужно оплатить до {date}", { date: t.date(due.aging.dueDate) })}</p>
      ) : null}
      <div className="flex justify-between gap-3 rounded-md bg-gray-50 px-3 py-2 text-sm font-medium">
        <span>{t("При получении оплатить не менее")}</span>
        <span>{t.money(due.required)}</span>
      </div>
    </div>
  );
}

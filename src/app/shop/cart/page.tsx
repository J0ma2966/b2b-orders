import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { CheckoutAllForm } from "@/components/orders/shop-forms";
import { formatPhone } from "@/lib/phone";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";

// Корзины по поставщикам: у каждого поставщика свой заказ (ТЗ п. 21).
export default async function CartsPage() {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  const carts = await db.order.findMany({
    where: { shopId: ctx.shop.id, status: "DRAFT", items: { some: {} } },
    include: { supplier: true, _count: { select: { items: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <>
      <PageHeader title="Корзина" subtitle="Заказ оформляется отдельно у каждого поставщика" />
      {carts.length === 0 ? (
        <EmptyState>
          {t("Корзина пуста.")} <Link href="/shop/suppliers" className="text-brand-600">{t("Выбрать поставщика")}</Link>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {carts.map((c) => (
            <Link key={c.id} href={`/shop/cart/${c.supplierId}`} className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 ring-1 ring-black/5 hover:ring-brand-500">
              <div className="min-w-0">
                <div className="truncate font-semibold">{c.supplier.displayName}</div>
                <div className="text-sm text-gray-500">{c._count.items} {t.plural(c._count.items, "позиция", "позиции", "позиций")}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-lg font-bold tabular-nums">{t.money(c.total)}</span>
                <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-on-accent">{t(ctx.membership.role === "OWNER" ? "Оформить" : "Открыть")}</span>
              </div>
            </Link>
          ))}
          {carts.length > 1 && ctx.membership.role === "OWNER" && !ctx.shop.isBlocked && (
            <Card className="mt-6">
              <h2 className="mb-1 font-display text-lg font-semibold">{t("Оформить все корзины сразу")}</h2>
              <p className="mb-4 text-sm text-gray-500">{t("У каждого поставщика будет свой заказ. Если какой-то не получится оформить, он останется в корзине.")}</p>
              <CheckoutAllForm
                count={carts.length}
                total={t.money(carts.reduce((s, c) => s + Number(c.total), 0))}
                defaults={{ address: ctx.shop.address, contactName: ctx.shop.contactName, contactPhone: formatPhone(ctx.shop.phone) }}
              />
            </Card>
          )}
        </div>
      )}
    </>
  );
}

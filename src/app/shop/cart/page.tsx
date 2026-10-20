import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
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
                <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-on-accent">{t("Оформить")}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

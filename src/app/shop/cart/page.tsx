import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { formatMoney, pluralRu } from "@/lib/format";

// Корзины по поставщикам: у каждого поставщика свой заказ (ТЗ п. 21).
export default async function CartsPage() {
  const ctx = await requireShop();
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
          Корзина пуста. <Link href="/shop/suppliers" className="text-brand-600">Выбрать поставщика</Link>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {carts.map((c) => (
            <Link key={c.id} href={`/shop/cart/${c.supplierId}`} className="block">
              <Card className="flex items-center justify-between hover:ring-brand-500">
                <div>
                  <div className="font-medium">{c.supplier.displayName}</div>
                  <div className="text-sm text-gray-500">{c._count.items} {pluralRu(c._count.items, "позиция", "позиции", "позиций")}</div>
                </div>
                <div className="font-semibold">{formatMoney(c.total)}</div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

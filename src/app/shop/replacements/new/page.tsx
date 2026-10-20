import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { NewReplacementForm } from "@/components/orders/replacement-forms";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { formatQty } from "@/lib/catalog";
import { RECEIVED } from "@/lib/order-core";
import { replaceableQty } from "@/lib/replacements";
import { getT } from "@/lib/i18n/server";

export default async function NewReplacementPage({ searchParams }: PageProps<"/shop/replacements/new">) {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  const sp = await searchParams;
  const orderId = typeof sp.order === "string" ? sp.order : "";
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: { include: { productUnit: { include: { product: true } } } } } });
  if (!order || order.shopId !== ctx.shop.id || !RECEIVED.includes(order.status)) notFound();
  const items = [];
  for (const i of order.items) {
    if (!i.productUnit.product.allowReplacement) continue;
    const left = await replaceableQty(i.id);
    if (left > 0) items.push({ id: i.id, label: `${i.productName} — ${t(i.unitLabel)}, ${t("можно до {qty}", { qty: formatQty(left) })}` });
  }
  return (
    <>
      <PageHeader title="Заявка на замену" subtitle={<Link className="text-brand-600" href={`/shop/orders/${order.id}`}>← {t("Заказ №{n}", { n: order.number })}</Link>} />

      {items.length === 0 ? (
        <EmptyState>{t("В этом заказе нет товаров, которые можно заменить")}</EmptyState>
      ) : (
        <Card className="max-w-2xl"><NewReplacementForm orderId={order.id} items={items} /></Card>
      )}
    </>
  );
}

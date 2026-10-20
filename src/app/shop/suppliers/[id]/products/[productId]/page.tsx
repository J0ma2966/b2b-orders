import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, DefinitionList, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { formatQty, unitName } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { shopVisibleProduct, shopVisibleUnits, supplierForShop } from "@/lib/shop-catalog";
import { fileUrl } from "@/lib/storage-url";

export default async function ShopProductPage({ params }: PageProps<"/shop/suppliers/[id]/products/[productId]">) {
  const ctx = await requireShop();
  const { id, productId } = await params;
  if (ctx.shop.isBlocked) notFound();
  const supplier = await supplierForShop(ctx.shop.territoryId, id);
  if (!supplier) notFound();
  const product = await db.product.findFirst({
    where: { id: productId, ...shopVisibleProduct(supplier.id) },
    include: { units: shopVisibleUnits, category: true },
  });
  if (!product) notFound();
  const attrs = Array.isArray(product.attributes) ? (product.attributes as { name: string; value: string }[]) : [];
  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={<Link href={`/shop/suppliers/${supplier.id}`} className="text-brand-600">← {supplier.displayName}</Link>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-2 md:px-0">
          {product.photoPaths.length === 0 && <div className="aspect-square w-full rounded-xl bg-gray-100" />}
          {product.photoPaths.map((p) => (
            <img key={p} src={fileUrl(p)!} alt="" className="aspect-square w-4/5 shrink-0 snap-center rounded-xl object-cover md:w-full" />
          ))}
        </div>
        <div className="space-y-4">
          <Card>
            <ul className="divide-y divide-gray-100">
              {product.units.map((u) => {
                const avail = Number(u.physicalQty) - Number(u.reservedQty);
                return (
                  <li key={u.id} className="flex items-center justify-between py-2">
                    <span className="text-lg font-semibold">{formatMoney(u.price)} <span className="text-sm font-normal text-gray-500">/ {unitName(u)}</span></span>
                    <span className={avail > 0 ? "text-sm text-gray-600" : "text-sm text-red-600"}>{avail > 0 ? `в наличии ${formatQty(avail)}` : "нет в наличии"}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-gray-500">Корзина и оформление заказа появятся на следующем этапе.</p>
          </Card>
          <Card>
            <DefinitionList
              items={[
                ["Категория", product.category?.name],
                ["Бренд", product.brand],
                ["Вес", product.weightKg ? `${formatQty(product.weightKg)} кг` : null],
                ...attrs.map((a) => [a.name, a.value || "да"] as [string, string]),
              ]}
            />
            {product.description && <p className="mt-3 text-sm whitespace-pre-line text-gray-700">{product.description}</p>}
          </Card>
        </div>
      </div>
    </>
  );
}

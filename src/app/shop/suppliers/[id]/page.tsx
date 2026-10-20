import { notFound } from "next/navigation";
import { Alert, Card, DefinitionList, PageHeader } from "@/components/ui";
import { requireShop } from "@/lib/auth/current";
import { formatPhone } from "@/lib/phone";
import { fileUrl } from "@/lib/storage-url";
import { availableSuppliersForShop } from "@/lib/territory";

export default async function ShopSupplierPage({ params }: PageProps<"/shop/suppliers/[id]">) {
  const ctx = await requireShop();
  const { id } = await params;
  // Магазин видит только поставщиков своей территории (ТЗ п. 61–62)
  const supplier = (await availableSuppliersForShop(ctx.shop.territoryId)).find((s) => s.id === id);
  if (!supplier || ctx.shop.isBlocked) notFound();
  const logo = fileUrl(supplier.logoPath);
  return (
    <>
      <PageHeader title={supplier.displayName} />
      <Card className="mb-4">
        {logo && <img src={logo} alt="" className="mb-3 size-20 rounded-lg object-cover" />}
        <DefinitionList
          items={[
            ["О компании", supplier.description],
            ["Телефон", <a key="p" href={`tel:${supplier.phone}`} className="text-brand-600">{formatPhone(supplier.phone)}</a>],
            ["Email", supplier.email],
            ["Сайт", supplier.website],
          ]}
        />
      </Card>
      <Alert>Каталог поставщика и заказ появятся на следующем этапе разработки.</Alert>
    </>
  );
}

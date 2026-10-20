import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { attributesToText, formatQty, unitName } from "@/lib/catalog";
import { toggleArchiveProductAction } from "../actions";
import { EditProductForm, StockForm, UnitsForm } from "./forms";
import { getT } from "@/lib/i18n/server";

export default async function ProductPage({ params, searchParams }: PageProps<"/supplier/catalog/[id]">) {
  const t = await getT();
  const ctx = await requireActiveSupplier();
  const { id } = await params;
  const sp = await searchParams;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      units: { orderBy: { sortOrder: "asc" }, include: { priceHistory: { orderBy: { createdAt: "desc" }, take: 5 } } },
    },
  });
  if (!product || product.supplierId !== ctx.supplier.id) notFound();
  const categories = await db.category.findMany({
    where: { supplierId: ctx.supplier.id, OR: [{ isArchived: false }, { id: product.categoryId ?? "" }] },
    orderBy: { name: "asc" },
  });
  const units = product.units.map((u) => ({
    id: u.id,
    label: unitName(u),
    price: u.price?.toString() ?? "",
    isActive: u.isActive,
    physical: Number(u.physicalQty),
    reserved: Number(u.reservedQty),
  }));
  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={
          <span className="flex gap-2">
            {product.archivedAt && <Badge>{t("Удалён из каталога {date}", { date: t.dateTime(product.archivedAt) })}</Badge>}
            {!product.isAvailable && <Badge color="yellow">{t("Снят с продажи")}</Badge>}
          </span>
        }
        actions={
          <form action={toggleArchiveProductAction}>
            <input type="hidden" name="productId" value={product.id} />
            <SubmitButton
              variant={product.archivedAt ? "secondary" : "ghost"}
              confirm={product.archivedAt ? undefined : "Удалить товар из каталога? История заказов и остатков сохранится."}
            >
              {product.archivedAt ? "Вернуть в каталог" : "Удалить из каталога"}
            </SubmitButton>
          </form>
        }
      />
      {sp.created && <div className="mb-4"><Alert tone="success">{t("Товар создан")}</Alert></div>}
      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <h2 className="mb-3 font-semibold">{t("Карточка товара")}</h2>
          <EditProductForm
            productId={product.id}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            photos={product.photoPaths}
            defaults={{
              name: product.name,
              description: product.description ?? "",
              brand: product.brand ?? "",
              sku: product.sku ?? "",
              categoryId: product.categoryId ?? "",
              weightKg: product.weightKg?.toString() ?? "",
              attributes: attributesToText(product.attributes),
              isAvailable: product.isAvailable,
              allowReplacement: product.allowReplacement,
            }}
          />
        </Card>
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <h2 className="mb-3 font-semibold">{t("Единицы, цены и остатки")}</h2>
            <UnitsForm productId={product.id} units={units} />
          </Card>
          {units.length > 0 && (
            <Card>
              <h2 className="mb-3 font-semibold">{t("Складская операция")}</h2>
              <StockForm units={units.map((u) => ({ id: u.id, label: u.label }))} />
            </Card>
          )}
          <Card>
            <h2 className="mb-3 font-semibold">{t("История")}</h2>
            <ul className="space-y-2 text-sm">
              {product.units.map((u) => (
                <li key={u.id}>
                  <div className="flex items-center justify-between">
                    <b>{t(unitName(u))}</b>
                    <Link href={`/supplier/stock/${u.id}`} className="text-xs text-brand-600">{t("Журнал склада →")}</Link>
                  </div>
                  {u.priceHistory.map((h) => (
                    <div key={h.id} className="text-xs text-gray-500">
                      {t.dateTime(h.createdAt)}: {h.oldPrice ? t.money(h.oldPrice) : "—"} → {h.newPrice ? t.money(h.newPrice) : t("без цены")}
                    </div>
                  ))}
                  <div className="text-xs text-gray-500">{t("Физический {p}, в резерве {r}", { p: formatQty(u.physicalQty), r: formatQty(u.reservedQty) })}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

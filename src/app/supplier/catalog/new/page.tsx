import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { NewProductForm } from "./form";

export default async function NewProductPage() {
  const ctx = await requireActiveSupplier();
  const categories = await db.category.findMany({ where: { supplierId: ctx.supplier.id, isArchived: false }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Новый товар" />
      <Card className="max-w-3xl">
        <NewProductForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
      </Card>
    </>
  );
}

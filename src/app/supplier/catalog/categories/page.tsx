import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { toggleCategoryAction } from "../actions";
import { CategoryForm } from "./form";
import { getT } from "@/lib/i18n/server";

export default async function CategoriesPage() {
  const t = await getT();
  const ctx = await requireActiveSupplier();
  const categories = await db.category.findMany({
    where: { supplierId: ctx.supplier.id },
    include: { _count: { select: { products: { where: { archivedAt: null } } } } },
    orderBy: [{ isArchived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return (
    <>
      <PageHeader title="Категории" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-0 sm:p-0 lg:col-span-2">
          {categories.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">{t("Категорий пока нет")}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {categories.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <div className={c.isArchived ? "text-gray-400" : ""}>
                    <CategoryForm id={c.id} name={c.name} />
                    <span className="text-xs text-gray-500">{t("товаров: {n}", { n: c._count.products })}</span>
                  </div>
                  <form action={toggleCategoryAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-xs text-brand-600 hover:underline">{c.isArchived ? t("Вернуть") : t("Скрыть")}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">{t("Новая категория")}</h2>
          <CategoryForm />
        </Card>
      </div>
    </>
  );
}

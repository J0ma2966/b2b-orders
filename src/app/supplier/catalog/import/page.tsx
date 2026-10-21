import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireActiveSupplier } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";
import { ImportForm } from "./form";

// П7: загрузка каталога, цен и прихода из Excel
export default async function CatalogImportPage() {
  const [, t] = await Promise.all([requireActiveSupplier(), getT()]);
  return (
    <>
      <PageHeader title="Загрузка из Excel" subtitle={<Link href="/supplier/catalog" className="text-brand-600">{t("← Каталог")}</Link>} />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <h2 className="mb-2 font-semibold">{t("Как заполнить")}</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
            <li>
              <a href="/api/export/supplier/catalog" download className="font-medium text-brand-600 hover:underline">{t("Скачайте текущий каталог")}</a> {t("— это и есть шаблон.")}
            </li>
            <li>{t("Поменяйте цены, допишите новые товары, в столбце «Приход» укажите, сколько поступило на склад.")}</li>
            <li>{t("Загрузите файл: сначала покажем, что изменится, и только после подтверждения применим.")}</li>
          </ol>
          <p className="mt-3 text-sm text-gray-500">
            {t("Товар находится по артикулу, а без артикула — по названию. Единица: шт., коробка, блок, кг, упаковка, л или своё название. Пустая цена не меняет текущую. Новые категории создаются сами.")}
          </p>
        </Card>
        <Card className="lg:col-span-3">
          <ImportForm />
        </Card>
      </div>
    </>
  );
}

import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { DefaultCommissionForm } from "./form";

export default async function SettingsPage() {
  await requireSuperAdmin();
  const setting = await db.platformSetting.findUnique({ where: { key: "defaultCommissionRate" } });
  return (
    <>
      <PageHeader title="Настройки платформы" />
      <Card className="max-w-md">
        <h2 className="mb-1 font-semibold">Стандартная комиссия</h2>
        <p className="mb-3 text-sm text-gray-500">Применяется ко всем поставщикам без индивидуальной ставки. Комиссия только рассчитывается, оплата идёт вне платформы.</p>
        <DefaultCommissionForm current={String(setting?.value ?? "")} />
      </Card>
    </>
  );
}

import { EmptyState, PageHeader } from "@/components/ui";
import { requireSupplier } from "@/lib/auth/current";

export default async function CourierHome() {
  const ctx = await requireSupplier(["COURIER"]);
  return (
    <>
      <PageHeader title="Мои доставки" subtitle={ctx.supplier.displayName} />
      <EmptyState>Назначенных доставок пока нет. Раздел заработает на этапе доставки.</EmptyState>
    </>
  );
}

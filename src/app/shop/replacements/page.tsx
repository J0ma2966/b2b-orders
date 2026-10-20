import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { ReplacementList } from "@/components/orders/replacement-view";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";
import { cancelReplacementAction } from "./actions";

export default async function ShopReplacementsPage({ searchParams }: PageProps<"/shop/replacements">) {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  const sp = await searchParams;
  const rows = await db.replacement.findMany({ where: { shopId: ctx.shop.id }, include: { order: true, supplier: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title="Замены" subtitle="Заявку на замену можно создать из полученного заказа" />
      {sp.created && <div className="mb-4"><Alert tone="success">{t("Заявка отправлена поставщику")}</Alert></div>}
      {rows.length === 0 ? (
        <EmptyState>{t("Заявок на замену нет")}</EmptyState>
      ) : (
        <ReplacementList
          rows={rows}
          extra={(r) => {
            const full = rows.find((x) => x.id === r.id)!;
            return (
              <div className="mt-1 text-xs text-gray-600">
                {full.supplier.displayName}
                {full.decisionComment && <div>{t("Ответ поставщика: {text}", { text: full.decisionComment })}</div>}

                {full.status === "NEW" && (
                  <form action={cancelReplacementAction} className="mt-1">
                    <input type="hidden" name="id" value={full.id} />
                    <SubmitButton variant="ghost" className="min-h-0 px-0 py-0 text-xs text-red-600" pendingText="…" confirm="Отменить заявку?">{t("Отменить заявку")}</SubmitButton>
                  </form>
                )}
              </div>
            );
          }}
        />
      )}
    </>
  );
}

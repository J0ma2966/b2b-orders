import { EmptyState, PageHeader } from "@/components/ui";
import { InvoiceList } from "@/components/commission/invoice-list";
import { requireSupplier } from "@/lib/auth/current";
import { supplierCommissionDebt } from "@/lib/commission-invoices";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";

// А1: счета платформы на комиссию и долг поставщика перед платформой
export default async function SupplierCommissionPage() {
  const [ctx, t] = await Promise.all([requireSupplier(["OWNER", "ADMIN"]), getT()]);
  const [rows, debt] = await Promise.all([
    db.commissionInvoice.findMany({ where: { supplierId: ctx.supplier.id }, orderBy: { period: "desc" }, take: 60 }),
    supplierCommissionDebt(ctx.supplier.id),
  ]);
  const rate = ctx.supplier.commissionRate;
  return (
    <>
      <PageHeader
        title="Комиссия платформы"
        subtitle={`${t("К оплате: {sum}", { sum: t.money(debt) })}${rate !== null ? ` · ${t("ставка {rate}%", { rate: rate.toString() })}` : ""}`}
      />
      <p className="mb-4 text-sm text-gray-500">{t("Счёт выставляется 1-го числа за прошлый месяц по полученным заказам. Оплата — вне платформы, администратор отмечает её здесь.")}</p>
      {rows.length === 0 ? <EmptyState>{t("Счетов пока нет")}</EmptyState> : <InvoiceList rows={rows} />}
    </>
  );
}

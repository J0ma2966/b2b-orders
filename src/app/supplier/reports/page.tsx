import { ExportLink } from "@/components/ui/export-link";
import { PageHeader } from "@/components/ui";
import { PeriodTabs, ReportView } from "@/components/reports/report-view";
import { requireActiveSupplier } from "@/lib/auth/current";
import { parsePeriod, periodRange, toLocalDateInput } from "@/lib/report-core";
import { buildReport } from "@/lib/reports";

export default async function SupplierReportsPage({ searchParams }: PageProps<"/supplier/reports">) {
  const ctx = await requireActiveSupplier();
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const range = periodRange(period, new Date(), { from: typeof sp.from === "string" ? sp.from : undefined, to: typeof sp.to === "string" ? sp.to : undefined });
  const report = await buildReport({ ...range, supplierId: ctx.supplier.id });
  return (
    <>
      <PageHeader title="Отчёты" subtitle={`${toLocalDateInput(range.from)} — ${toLocalDateInput(new Date(range.to.getTime() - 1))}`} actions={<ExportLink href={`/api/export/supplier/report?period=custom&from=${toLocalDateInput(range.from)}&to=${toLocalDateInput(new Date(range.to.getTime() - 1))}`} />} />
      <PeriodTabs base="/supplier/reports" period={period} params={{}} from={toLocalDateInput(range.from)} to={toLocalDateInput(new Date(range.to.getTime() - 1))} />
      <ReportView r={report} scope="supplier" />
    </>
  );
}

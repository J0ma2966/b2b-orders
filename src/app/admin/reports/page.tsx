import { PageHeader } from "@/components/ui";
import { PeriodTabs, ReportView } from "@/components/reports/report-view";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { ORDER_STATUS_LABEL } from "@/lib/order-core";
import { parsePeriod, periodRange, toLocalDateInput } from "@/lib/report-core";
import { buildReport } from "@/lib/reports";
import type { OrderStatus } from "@/generated/prisma/enums";

const sel = "rounded-lg px-2 py-1.5 text-sm ring-1 ring-gray-300 max-w-48";

// Отчёты супер-администратора с фильтрами (ТЗ п. 70)
export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const period = parsePeriod(sp.period);
  const range = periodRange(period, new Date(), { from: str("from") || undefined, to: str("to") || undefined });
  const status = str("status") in ORDER_STATUS_LABEL ? (str("status") as OrderStatus) : undefined;
  const [suppliers, regions, shops, products] = await Promise.all([
    db.supplier.findMany({ where: { status: { in: ["ACTIVE", "BLOCKED"] } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    db.territory.findMany({ where: { type: { in: ["REGION", "CITY"] }, isActive: true }, select: { id: true, name: true, type: true }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    db.shop.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    str("supplier") ? db.product.findMany({ where: { supplierId: str("supplier") }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const report = await buildReport({
    ...range,
    supplierId: str("supplier") || undefined,
    territoryId: str("territory") || undefined,
    shopId: str("shop") || undefined,
    productId: str("product") || undefined,
    status,
  });
  const params = Object.fromEntries(["supplier", "territory", "shop", "product", "status"].map((k) => [k, str(k)]).filter(([, v]) => v));
  const to = toLocalDateInput(new Date(range.to.getTime() - 1));
  return (
    <>
      <PageHeader title="Отчёты платформы" subtitle={`${toLocalDateInput(range.from)} — ${to}`} />
      <form className="mb-3 flex flex-wrap gap-2">
        <input type="hidden" name="period" value={period} />
        {period === "custom" && <><input type="hidden" name="from" value={toLocalDateInput(range.from)} /><input type="hidden" name="to" value={to} /></>}
        <select name="supplier" defaultValue={str("supplier")} className={sel} aria-label="Поставщик"><option value="">Все поставщики</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}</select>
        <select name="territory" defaultValue={str("territory")} className={sel} aria-label="Регион или город"><option value="">Все регионы</option>{regions.map((t) => <option key={t.id} value={t.id}>{t.type === "CITY" ? "· " : ""}{t.name}</option>)}</select>
        <select name="shop" defaultValue={str("shop")} className={sel} aria-label="Магазин"><option value="">Все магазины</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        {products.length > 0 && <select name="product" defaultValue={str("product")} className={sel} aria-label="Товар"><option value="">Все товары</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <select name="status" defaultValue={str("status")} className={sel} aria-label="Статус заказа"><option value="">Полученные заказы</option>{(["COMPLETED", "PARTIALLY_ACCEPTED"] as const).map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}</select>
        <button className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-gray-300">Применить</button>
      </form>
      <PeriodTabs base="/admin/reports" period={period} params={params} from={toLocalDateInput(range.from)} to={to} />
      <ReportView r={report} scope="admin" />
    </>
  );
}

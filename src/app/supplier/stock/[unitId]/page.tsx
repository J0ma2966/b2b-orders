import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { formatQty, unitName } from "@/lib/catalog";
import { MOVEMENT_LABEL } from "@/lib/stock-core";
import { getT } from "@/lib/i18n/server";
import { ThresholdForm } from "./threshold-form";

// Журнал складских операций по единице товара (ТЗ п. 20)
export default async function StockJournalPage({ params }: PageProps<"/supplier/stock/[unitId]">) {
  const t = await getT();
  const ctx = await requireActiveSupplier();
  const { unitId } = await params;
  const unit = await db.productUnit.findUnique({ where: { id: unitId }, include: { product: true, baseUnit: true } });
  if (!unit || unit.product.supplierId !== ctx.supplier.id) notFound();
  // Л4: связанная единица своего журнала не ведёт — все операции в журнале базовой
  if (unit.baseUnit) {
    return (
      <>
        <PageHeader title={`${unit.product.name} · ${t(unitName(unit))}`} subtitle={<Link href={`/supplier/catalog/${unit.productId}`} className="text-brand-600">{t("← К товару")}</Link>} />
        <Card>
          <p className="text-sm">
            {t("1 {unit} = {n} {base}. Остаток ведётся в «{base}», доступно целых: {qty}.", { unit: t(unitName(unit)), n: formatQty(unit.baseQty!), base: t(unitName(unit.baseUnit)), qty: formatQty(unit.physicalQty) })}
          </p>
          <Link href={`/supplier/stock/${unit.baseUnit.id}`} className="mt-2 inline-block text-sm text-brand-600">{t("Журнал склада →")}</Link>
        </Card>
      </>
    );
  }
  const moves = await db.stockMovement.findMany({ where: { productUnitId: unitId }, orderBy: { createdAt: "desc" }, take: 200 });
  const userIds = [...new Set(moves.flatMap((m) => [m.userId, m.onBehalfOfUserId]).filter((x): x is string => !!x))];
  const users = new Map((await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  const signed = (v: { toString(): string }) => {
    const n = Number(v.toString());
    return n === 0 ? "—" : `${n > 0 ? "+" : ""}${formatQty(n)}`;
  };
  return (
    <>
      <PageHeader
        title={`${unit.product.name} · ${t(unitName(unit))}`}
        subtitle={<Link href={`/supplier/catalog/${unit.productId}`} className="text-brand-600">{t("← К товару")}</Link>}
      />
      <Card className="mb-4">
        <p className="mb-3 text-sm">
          {t("Доступно {qty}", { qty: formatQty(Number(unit.physicalQty) - Number(unit.reservedQty)) })} · {t("на складе {qty}", { qty: formatQty(unit.physicalQty) })} · {t("в резерве {qty}", { qty: formatQty(unit.reservedQty) })}
        </p>
        <ThresholdForm unitId={unit.id} current={unit.lowStockThreshold?.toString() ?? ""} />
      </Card>
      <Card className="overflow-x-auto p-0 sm:p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">{t("Когда")}</th>
              <th className="px-4 py-2 font-medium">{t("Операция")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("Физ.")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("Резерв")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("Остаток после")}</th>
              <th className="px-4 py-2 font-medium">{t("Кто · основание")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {moves.map((m) => (
              <tr key={m.id} className="align-top">
                <td className="px-4 py-2 whitespace-nowrap text-gray-500">{t.dateTime(m.createdAt)}</td>
                <td className="px-4 py-2">{t(MOVEMENT_LABEL[m.type])}</td>
                <td className="px-4 py-2 text-right tabular-nums">{signed(m.physicalDelta)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{signed(m.reservedDelta)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatQty(m.physicalAfter)} / {formatQty(m.reservedAfter)}
                </td>
                <td className="px-4 py-2 text-xs">
                  {m.userId ? users.get(m.userId) : t("Система")}
                  {m.onBehalfOfUserId && <span className="text-yellow-700"> {t("(от имени {name})", { name: users.get(m.onBehalfOfUserId) })}</span>}
                  {m.reason && <div className="text-gray-500">{t(m.reason)}</div>}
                  {m.relatedEntity && <div className="text-gray-400">{m.relatedEntity} {m.relatedId}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

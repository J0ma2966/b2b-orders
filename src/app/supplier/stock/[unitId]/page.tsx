import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { formatQty, unitName } from "@/lib/catalog";
import { formatDateTime } from "@/lib/format";
import { MOVEMENT_LABEL } from "@/lib/stock-core";

// Журнал складских операций по единице товара (ТЗ п. 20)
export default async function StockJournalPage({ params }: PageProps<"/supplier/stock/[unitId]">) {
  const ctx = await requireActiveSupplier();
  const { unitId } = await params;
  const unit = await db.productUnit.findUnique({ where: { id: unitId }, include: { product: true } });
  if (!unit || unit.product.supplierId !== ctx.supplier.id) notFound();
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
        title={`${unit.product.name} · ${unitName(unit)}`}
        subtitle={<Link href={`/supplier/catalog/${unit.productId}`} className="text-brand-600">← К товару</Link>}
      />
      <Card className="overflow-x-auto p-0 sm:p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Когда</th>
              <th className="px-4 py-2 font-medium">Операция</th>
              <th className="px-4 py-2 text-right font-medium">Физ.</th>
              <th className="px-4 py-2 text-right font-medium">Резерв</th>
              <th className="px-4 py-2 text-right font-medium">Остаток после</th>
              <th className="px-4 py-2 font-medium">Кто · основание</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {moves.map((m) => (
              <tr key={m.id} className="align-top">
                <td className="px-4 py-2 whitespace-nowrap text-gray-500">{formatDateTime(m.createdAt)}</td>
                <td className="px-4 py-2">{MOVEMENT_LABEL[m.type]}</td>
                <td className="px-4 py-2 text-right tabular-nums">{signed(m.physicalDelta)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{signed(m.reservedDelta)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatQty(m.physicalAfter)} / {formatQty(m.reservedAfter)}
                </td>
                <td className="px-4 py-2 text-xs">
                  {m.userId ? users.get(m.userId) : "Система"}
                  {m.onBehalfOfUserId && <span className="text-yellow-700"> (от имени {users.get(m.onBehalfOfUserId)})</span>}
                  {m.reason && <div className="text-gray-500">{m.reason}</div>}
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

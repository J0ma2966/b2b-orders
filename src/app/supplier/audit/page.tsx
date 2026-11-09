import { Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import type { AuditChange } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";
import { getT } from "@/lib/i18n/server";

const ENTITIES: [string, string][] = [
  ["Supplier", "Профиль"],
  ["SupplierMember", "Сотрудники"],
  ["Product", "Товары"],
  ["ProductUnit", "Цены и единицы"],
  ["BonusPromotion", "Бонусы"],
  ["Order", "Заказы"],
  ["ShopAccount", "Долги и кредит"],
  ["Replacement", "Замены"],
  ["ReturnedItem", "Возвращённые"],
];

// Журнал действий сотрудников поставщика (ТЗ п. 84): только записи своей компании
export default async function SupplierAuditPage({ searchParams }: PageProps<"/supplier/audit">) {
  const t = await getT();
  const ctx = await requireActiveSupplier(["OWNER", "ADMIN"]);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const entity = typeof sp.status === "string" && sp.status ? sp.status : undefined;
  const page = pageFrom(sp);
  const where: Prisma.AuditLogWhereInput = {
    supplierId: ctx.supplier.id,
    ...(entity && { entity }),
    ...(q && { OR: [{ entityId: q }, { action: { contains: q } }] }),
  };
  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const userIds = [...new Set(rows.flatMap((r) => [r.actorUserId, r.onBehalfOfUserId]).filter((x): x is string => !!x))];
  const users = new Map((await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })).map((u) => [u.id, t.person(u.fullName)]));
  const entityLabel = new Map(ENTITIES);
  return (
    <>
      <PageHeader title="Журнал действий" subtitle="Кто и что менял в вашей компании" />
      <FilterBar q={q} status={entity} statuses={ENTITIES} allLabel="Все разделы" placeholder="ID объекта или действие" />
      {rows.length === 0 ? (
        <EmptyState>{t("Записей нет")}</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="stack-table w-full text-left text-sm sm:min-w-[720px]">
            <thead className="border-b border-gray-200 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">{t("Когда")}</th>
                <th className="px-4 py-2 font-medium">{t("Кто")}</th>
                <th className="px-4 py-2 font-medium">{t("Раздел")}</th>
                <th className="px-4 py-2 font-medium">{t("Действие")}</th>
                <th className="px-4 py-2 font-medium">{t("Изменения")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500">{t.dateTime(r.createdAt)}</td>
                  <td data-label={t("Кто")} className="px-4 py-2">
                    {r.actorUserId ? users.get(r.actorUserId) ?? "—" : t("Система")}
                    {r.onBehalfOfUserId && <div className="text-xs text-yellow-700">{t("от имени {name}", { name: users.get(r.onBehalfOfUserId) })}</div>}
                  </td>
                  <td data-label={t("Раздел")} className="px-4 py-2">{t(entityLabel.get(r.entity) ?? r.entity)}</td>
                  <td data-label={t("Действие")} className="px-4 py-2">
                    {r.action}
                    {r.comment && <div className="text-xs text-gray-500">{t(r.comment)}</div>}
                  </td>
                  <td data-label={t("Изменения")} className="stack-wide px-4 py-2 text-xs">
                    {((r.changes as AuditChange[] | null) ?? []).map((c, i) => (
                      <div key={i}>
                        <span className="text-gray-500">{c.field}:</span> {JSON.stringify(c.old)} → {JSON.stringify(c.new)}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={page} total={total} basePath="/supplier/audit" params={{ q, status: entity }} />
    </>
  );
}

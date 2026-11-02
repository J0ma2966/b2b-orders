import { Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import type { AuditChange } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";
import { getT } from "@/lib/i18n/server";

const ENTITIES: [string, string][] = [
  ["Supplier", "Поставщики"],
  ["Shop", "Магазины"],
  ["User", "Пользователи"],
  ["SupplierMember", "Сотрудники"],
  ["Territory", "Территории"],
  ["PlatformSetting", "Настройки"],
  ["Product", "Товары"],
  ["ProductUnit", "Цены и единицы"],
  ["Order", "Заказы"],
  ["ShopAccount", "Долги и кредит"],
  ["Replacement", "Замены"],
  ["ReturnedItem", "Возвращённые"],
];

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const t = await getT();
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const entity = typeof sp.status === "string" && sp.status ? sp.status : undefined;
  const page = pageFrom(sp);
  const where: Prisma.AuditLogWhereInput = {
    ...(entity && { entity }),
    ...(q && { OR: [{ entityId: q }, { action: { contains: q } }, { supplierId: q }, { shopId: q }, { actorUserId: q }] }),
  };
  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const userIds = [...new Set(rows.flatMap((r) => [r.actorUserId, r.onBehalfOfUserId]).filter((x): x is string => !!x))];
  const users = new Map((await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })).map((u) => [u.id, t.person(u.fullName)]));
  return (
    <>
      <PageHeader title="Аудит" subtitle="Все изменения, влияющие на работу системы" />
      <FilterBar q={q} status={entity} statuses={ENTITIES} allLabel="Все объекты" placeholder="ID объекта или действие" />
      {rows.length === 0 ? (
        <EmptyState>{t("Записей нет")}</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">{t("Когда")}</th>
                <th className="px-4 py-2 font-medium">{t("Кто")}</th>
                <th className="px-4 py-2 font-medium">{t("Объект")}</th>
                <th className="px-4 py-2 font-medium">{t("Действие")}</th>
                <th className="px-4 py-2 font-medium">{t("Изменения")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500">{t.dateTime(r.createdAt)}</td>
                  <td className="px-4 py-2">
                    {r.actorUserId ? users.get(r.actorUserId) ?? r.actorUserId : t("Система")}
                    {r.onBehalfOfUserId && <div className="text-xs text-yellow-700">{t("от имени {name}", { name: users.get(r.onBehalfOfUserId) })}</div>}
                    <div className="text-xs text-gray-400">{r.actorRole}</div>
                  </td>
                  <td className="px-4 py-2">
                    {r.entity}
                    <div className="font-mono text-xs text-gray-400">{r.entityId}</div>
                  </td>
                  <td className="px-4 py-2">
                    {r.action}
                    {r.comment && <div className="text-xs text-gray-500">{t(r.comment)}</div>}
                  </td>
                  <td className="px-4 py-2 text-xs">
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
      <Pagination page={page} total={total} basePath="/admin/audit" params={{ q, status: entity }} />
    </>
  );
}

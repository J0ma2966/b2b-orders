import { EntityActivity } from "@/components/orders/entity-activity";
import { notFound } from "next/navigation";
import { Badge, Card, DefinitionList, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { formatPhone } from "@/lib/phone";
import { ResetPasswordForm } from "@/components/admin/reset-password-form";
import { fileUrl } from "@/lib/storage";
import { loadTerritoryMap } from "@/lib/territory";
import { territoryLabel } from "@/lib/territory-core";
import {
  availableSupplierActions,
  SUPPLIER_ROLE_LABEL,
  SUPPLIER_STATUS_COLOR,
  SUPPLIER_STATUS_LABEL,
} from "@/lib/statuses";
import { startImpersonationAction } from "../../impersonation-actions";
import { CommissionForm, ModerationForm } from "./forms";
import { getT } from "@/lib/i18n/server";

export default async function SupplierDetailPage({ params }: PageProps<"/admin/suppliers/[id]">) {
  const t = await getT();
  await requireSuperAdmin();
  const { id } = await params;
  const [supplier, byId, defaultRate] = await Promise.all([
    db.supplier.findUnique({
      where: { id },
      include: {
        members: { include: { user: true }, orderBy: { createdAt: "asc" } },
        territories: true,
        statusHistory: { orderBy: { createdAt: "desc" } },
      },
    }),
    loadTerritoryMap(),
    db.platformSetting.findUnique({ where: { key: "defaultCommissionRate" } }),
  ]);
  if (!supplier) notFound();
  const logo = fileUrl(supplier.logoPath);
  const actions = availableSupplierActions(supplier.status);

  return (
    <>
      <PageHeader
        title={supplier.legalName}
        subtitle={<Badge color={SUPPLIER_STATUS_COLOR[supplier.status]}>{SUPPLIER_STATUS_LABEL[supplier.status]}</Badge>}
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <div className="mb-3 flex items-center gap-3">
              {logo && <img src={logo} alt="" className="size-14 rounded-lg object-cover ring-1 ring-gray-200" />}
              <h2 className="font-semibold">{t("Данные заявки")}</h2>
            </div>
            <DefinitionList
              items={[
                ["Юрлицо", supplier.legalName],
                ["Название для магазинов", supplier.displayName],
                ["ИНН", supplier.inn],
                ["Юридический адрес", supplier.legalAddress],
                ["Телефон", formatPhone(supplier.phone)],
                ["Email", supplier.email],
                ["Сайт", supplier.website],
                ["Контактное лицо", supplier.contactPerson],
                ["Описание", supplier.description],
                ["Офис", [supplier.officeTerritoryId && territoryLabel(supplier.officeTerritoryId, byId, t), supplier.officeAddress].filter(Boolean).join(", ")],
                [
                  "Координаты офиса",
                  supplier.officeLat && supplier.officeLng ? (
                    <a className="text-brand-600 hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${supplier.officeLat}&mlon=${supplier.officeLng}#map=16/${supplier.officeLat}/${supplier.officeLng}`}>
                      {supplier.officeLat.toFixed(5)}, {supplier.officeLng.toFixed(5)}
                    </a>
                  ) : null,
                ],
                ["Территория доставки", supplier.territories.map((x) => territoryLabel(x.territoryId, byId, t)).join("; ")],
                ["Заявка подана", t.dateTime(supplier.createdAt)],
              ]}
            />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{t("Сотрудники и доставщики")}</h2>
            <ul className="divide-y divide-gray-100">
              {supplier.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <div className="text-sm font-medium">{m.user.fullName}</div>
                    <div className="text-xs text-gray-500">
                      {t(SUPPLIER_ROLE_LABEL[m.role])} · {formatPhone(m.user.phone)}{!m.isActive && ` · ${t("отключён")}`}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {m.isActive && (
                      <form action={startImpersonationAction}>
                        <input type="hidden" name="memberId" value={m.id} />
                        <button className="text-sm text-brand-600 hover:underline">{t("Действовать от имени")}</button>
                      </form>
                    )}
                    {!m.user.isSuperAdmin && <ResetPasswordForm userId={m.userId} />}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          {actions.length > 0 && (
            <Card>
              <h2 className="mb-3 font-semibold">{t("Модерация")}</h2>
              <ModerationForm supplierId={supplier.id} actions={actions} currentComment={supplier.moderationComment} />
            </Card>
          )}
          <Card>
            <h2 className="mb-3 font-semibold">{t("Комиссия платформы")}</h2>
            <CommissionForm
              supplierId={supplier.id}
              current={supplier.commissionRate?.toString() ?? ""}
              defaultRate={String(defaultRate?.value ?? "—")}
            />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{t("История статусов")}</h2>
            <ol className="space-y-3">
              {supplier.statusHistory.map((h) => (
                <li key={h.id} className="text-sm">
                  <div>
                    {h.fromStatus ? `${t(SUPPLIER_STATUS_LABEL[h.fromStatus])} → ` : ""}
                    <b>{t(SUPPLIER_STATUS_LABEL[h.toStatus])}</b>
                  </div>
                  <div className="text-xs text-gray-500">{t.dateTime(h.createdAt)}</div>
                  {h.comment && <div className="text-xs text-gray-700">{t(h.comment)}</div>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
      <EntityActivity supplierId={supplier.id} />
    </>
  );
}

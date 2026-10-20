import { Badge, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { formatPhone } from "@/lib/phone";
import { SUPPLIER_ROLE_LABEL } from "@/lib/statuses";
import { assignableRoles, canManageMember } from "@/lib/supplier-roles";
import { toggleMemberAction } from "../actions";
import { AddMemberForm, ResetPasswordButton } from "./forms";
import { getT } from "@/lib/i18n/server";

export default async function TeamPage() {
  const t = await getT();
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const members = await db.supplierMember.findMany({
    where: { supplierId: ctx.supplier.id },
    include: { user: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  const roles = assignableRoles(ctx.membership.role);
  return (
    <>
      <PageHeader title="Сотрудники и доставщики" />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-0 sm:p-0 xl:col-span-2">
          <ul className="divide-y divide-gray-100">
            {members.map((m) => {
              const manageable = canManageMember(ctx.membership.role, m.role) && m.userId !== ctx.auth.user.id;
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className={m.isActive ? "" : "opacity-50"}>
                    <div className="font-medium">{m.user.fullName}</div>
                    <div className="text-xs text-gray-500">
                      {formatPhone(m.user.phone)} · {t("с {date}", { date: t.date(m.createdAt) })}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={m.role === "COURIER" ? "blue" : "gray"}>{SUPPLIER_ROLE_LABEL[m.role]}</Badge>
                    {!m.isActive && <Badge color="red">{t("Отключён")}</Badge>}
                    {manageable && (
                      <>
                        <ResetPasswordButton memberId={m.id} />
                        <form action={toggleMemberAction}>
                          <input type="hidden" name="memberId" value={m.id} />
                          <SubmitButton variant="ghost" className="min-h-0 px-2 py-1 text-xs" confirm={m.isActive ? `Отключить ${m.user.fullName}?` : undefined}>
                            {m.isActive ? "Отключить" : "Включить"}
                          </SubmitButton>
                        </form>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        {roles.length > 0 && (
          <Card>
            <h2 className="mb-3 font-semibold">{t("Добавить")}</h2>
            <AddMemberForm roles={roles.map((r) => [r, SUPPLIER_ROLE_LABEL[r]])} />
          </Card>
        )}
      </div>
    </>
  );
}

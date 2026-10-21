import { Badge, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { db } from "@/lib/db";
import { requireShopOwner } from "@/lib/auth/current";
import { formatPhone } from "@/lib/phone";
import { toggleShopStaffAction } from "./actions";
import { AddStaffForm, ResetStaffPasswordButton } from "./forms";
import { getT } from "@/lib/i18n/server";

// М6: владелец добавляет продавцов — они собирают корзину и принимают товар
export default async function ShopTeamPage() {
  const [ctx, t] = await Promise.all([requireShopOwner(), getT()]);
  const members = await db.shopMember.findMany({
    where: { shopId: ctx.shop.id },
    include: { user: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return (
    <>
      <PageHeader title="Сотрудники магазина" subtitle="Сотрудник собирает корзину и принимает товар. Оформление заказов, отмена, долги и профиль доступны только владельцу." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-0 sm:p-0 lg:col-span-2">
          <ul className="divide-y divide-gray-100">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className={m.isActive ? "" : "opacity-50"}>
                  <div className="font-medium">{m.user.fullName}</div>
                  <div className="text-xs text-gray-500">
                    {formatPhone(m.user.phone)} · {t("с {date}", { date: t.date(m.createdAt) })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={m.role === "OWNER" ? "green" : "gray"}>{t(m.role === "OWNER" ? "Владелец" : "Сотрудник")}</Badge>
                  {!m.isActive && <Badge color="red">{t("Отключён")}</Badge>}
                  {m.role === "STAFF" && (
                    <>
                      <ResetStaffPasswordButton memberId={m.id} />
                      <form action={toggleShopStaffAction}>
                        <input type="hidden" name="memberId" value={m.id} />
                        <SubmitButton variant="ghost" className="min-h-0 px-2 py-1 text-xs" confirm={m.isActive ? `Отключить ${m.user.fullName}?` : undefined}>
                          {m.isActive ? "Отключить" : "Включить"}
                        </SubmitButton>
                      </form>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">{t("Добавить сотрудника")}</h2>
          <AddStaffForm />
        </Card>
      </div>
    </>
  );
}

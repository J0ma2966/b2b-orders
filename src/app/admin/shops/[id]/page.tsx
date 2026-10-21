import { EntityActivity } from "@/components/orders/entity-activity";
import { notFound } from "next/navigation";
import { Badge, Card, DefinitionList, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { formatPhone } from "@/lib/phone";
import { ResetPasswordForm } from "@/components/admin/reset-password-form";
import { fileUrl } from "@/lib/storage";
import { availableSuppliersForShop, loadTerritoryMap } from "@/lib/territory";
import { territoryLabel } from "@/lib/territory-core";
import { SHOP_STATUS_COLOR, SHOP_STATUS_LABEL } from "@/lib/statuses";
import { toggleShopBlockAction } from "../../actions";
import { ShopStatusForm } from "./status-form";
import { getT } from "@/lib/i18n/server";

export default async function ShopDetailPage({ params }: PageProps<"/admin/shops/[id]">) {
  const t = await getT();
  await requireSuperAdmin();
  const { id } = await params;
  const [shop, byId] = await Promise.all([
    db.shop.findUnique({
      where: { id },
      include: { members: { include: { user: true } }, statusHistory: { orderBy: { createdAt: "desc" } } },
    }),
    loadTerritoryMap(),
  ]);
  if (!shop) notFound();
  const suppliers = await availableSuppliersForShop(shop.territoryId);
  return (
    <>
      <PageHeader
        title={shop.name}
        subtitle={
          <span className="flex gap-2">
            <Badge color={SHOP_STATUS_COLOR[shop.status]}>{SHOP_STATUS_LABEL[shop.status]}</Badge>
            {shop.isBlocked && <Badge color="red">{t("Заблокирован")}</Badge>}
          </span>
        }
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            {shop.photoPaths.length > 0 && (
              <div className="mb-3 flex gap-2 overflow-x-auto">
                {shop.photoPaths.map((p) => (
                  <img key={p} src={fileUrl(p)!} alt="" className="h-32 rounded-lg object-cover" />
                ))}
              </div>
            )}
            <DefinitionList
              items={[
                ["ИНН", shop.inn],
                ["Телефон", formatPhone(shop.phone)],
                ["Запасной телефон", shop.phone2 && formatPhone(shop.phone2)],
                ["Контактное лицо", shop.contactName],
                ["Регион", territoryLabel(shop.territoryId, byId, t)],
                ["Адрес", shop.address],
                [
                  "Координаты",
                  <a key="c" className="text-brand-600 hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${shop.lat}&mlon=${shop.lng}#map=17/${shop.lat}/${shop.lng}`}>
                    {shop.lat.toFixed(5)}, {shop.lng.toFixed(5)}
                  </a>,
                ],
                ["Зарегистрирован", t.dateTime(shop.createdAt)],
                [
                  "Пользователи",
                  <ul key="u" className="space-y-1">
                    {shop.members.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center gap-x-2">
                        {m.user.fullName} ({formatPhone(m.user.phone)})
                        {!m.user.isSuperAdmin && <ResetPasswordForm userId={m.userId} />}
                      </li>
                    ))}
                  </ul>,
                ],
                ["Доступные поставщики", suppliers.length ? suppliers.map((s) => s.displayName).join(", ") : t("нет")],
              ]}
            />
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold">{t("Статус")}</h2>
            <ShopStatusForm shopId={shop.id} current={shop.status} />
            <form action={toggleShopBlockAction} className="mt-4 border-t border-gray-100 pt-4">
              <input type="hidden" name="shopId" value={shop.id} />
              <SubmitButton variant={shop.isBlocked ? "secondary" : "danger"} confirm={shop.isBlocked ? undefined : "Заблокировать магазин?"}>
                {shop.isBlocked ? "Разблокировать" : "Заблокировать"}
              </SubmitButton>
            </form>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{t("История статусов")}</h2>
            <ol className="space-y-3">
              {shop.statusHistory.map((h) => (
                <li key={h.id} className="text-sm">
                  <div>
                    {h.fromStatus ? `${t(SHOP_STATUS_LABEL[h.fromStatus])} → ` : ""}
                    <b>{t(SHOP_STATUS_LABEL[h.toStatus])}</b>
                  </div>
                  <div className="text-xs text-gray-500">{t.dateTime(h.createdAt)}</div>
                  {h.reason && <div className="text-xs text-gray-700">{t(h.reason)}</div>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
      <EntityActivity shopId={shop.id} />
    </>
  );
}

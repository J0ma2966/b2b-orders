import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { requireShop } from "@/lib/auth/current";
import { SHOP_STATUS_COLOR, SHOP_STATUS_LABEL } from "@/lib/statuses";
import { getT } from "@/lib/i18n/server";
import { switchShopAction } from "../actions";

export default async function PointsPage() {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  return (
    <>
      <PageHeader
        title="Мои торговые точки"
        subtitle="Каждая точка ведёт свои заказы и задолженность отдельно"
        actions={<ButtonLink href="/register/shop">{t("+ Добавить точку")}</ButtonLink>}
      />
      <div className="space-y-3">
        {ctx.memberships.map((m) => (
          <Card key={m.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">{m.shop.name}</div>
              <div className="text-xs text-gray-500">{m.shop.address}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge color={SHOP_STATUS_COLOR[m.shop.status]}>{SHOP_STATUS_LABEL[m.shop.status]}</Badge>
              {m.shopId === ctx.shop.id ? (
                <Badge color="blue">{t("Текущая")}</Badge>
              ) : (
                <form action={switchShopAction}>
                  <input type="hidden" name="shopId" value={m.shopId} />
                  <button className="text-sm text-brand-600">{t("Переключиться")}</button>

                </form>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

import { Button, ButtonLink, Card, PageHeader } from "@/components/ui";
import { logoutAction } from "@/app/(auth)/actions";
import { requireShop } from "@/lib/auth/current";
import { getTerritoryOptions } from "@/lib/territory";
import { fileUrl } from "@/lib/storage-url";
import { ShopProfileForm } from "./form";
import { getT } from "@/lib/i18n/server";
import { unreadBySection } from "@/lib/nav-badges";
import { SHOP_NAV } from "@/components/shell/shop-nav";

// Непрочитанные уведомления раздела — те же, что у пункта «Профиль» в нижней панели
function Count({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="ml-1.5 min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] leading-5 font-bold text-on-accent" data-testid="nav-badge">{n > 99 ? "99+" : n}</span>;
}

export default async function ShopProfilePage() {
  const t = await getT();
  const ctx = await requireShop();
  const s = ctx.shop;
  const owner = ctx.membership.role === "OWNER";
  const [territories, unread] = await Promise.all([getTerritoryOptions(), unreadBySection(ctx.auth.user.id, SHOP_NAV.map((i) => i.href))]);
  return (
    <>
      <PageHeader title="Профиль магазина" actions={<>
        <ButtonLink href="/shop/points" variant="secondary">{t("📍 Мои точки")}<Count n={unread["/shop/points"]} /></ButtonLink>
        <ButtonLink href="/shop/replacements" variant="secondary">{t("🔁 Замены")}<Count n={unread["/shop/replacements"]} /></ButtonLink>
        {owner && <ButtonLink href="/shop/debts" variant="secondary">{t("💰 Задолженность")}<Count n={unread["/shop/debts"]} /></ButtonLink>}
        {owner && <ButtonLink href="/shop/team" variant="secondary">{t("👥 Сотрудники")}<Count n={unread["/shop/team"]} /></ButtonLink>}
        <ButtonLink href="/shop/documents" variant="secondary">{t("🧾 Документы")}<Count n={unread["/shop/documents"]} /></ButtonLink>
        <ButtonLink href="/account" variant="secondary">{t("⚙️ Настройки")}</ButtonLink>
        <form action={logoutAction}>
          <Button variant="secondary" className="text-red-600">⏻ Выйти</Button>
        </form>
      </>} />
      <Card className="max-w-2xl">
        {s.photoPaths.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto">
            {s.photoPaths.map((p) => (
              <img key={p} src={fileUrl(p)!} alt="" className="h-24 rounded-lg object-cover" />
            ))}
          </div>
        )}
        {!owner ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{s.name}</p>
            <p className="text-gray-600">{s.address}</p>
            <p className="pt-2 text-gray-500">{t("Изменить профиль может только владелец магазина")}</p>
          </div>
        ) : <ShopProfileForm
          territories={territories}
          defaults={{
            name: s.name,
            inn: s.inn ?? "",
            shopPhone: s.phone,
            phone2: s.phone2 ?? "",
            contactName: s.contactName,
            address: s.address,
            territoryId: s.territoryId,
            lat: String(s.lat),
            lng: String(s.lng),
          }}
        />}
      </Card>
    </>
  );
}

import { Button, ButtonLink, Card, PageHeader } from "@/components/ui";
import { logoutAction } from "@/app/(auth)/actions";
import { requireShop } from "@/lib/auth/current";
import { getTerritoryOptions } from "@/lib/territory";
import { fileUrl } from "@/lib/storage-url";
import { ShopProfileForm } from "./form";
import { getT } from "@/lib/i18n/server";

export default async function ShopProfilePage() {
  const t = await getT();
  const ctx = await requireShop();
  const s = ctx.shop;
  const owner = ctx.membership.role === "OWNER";
  const territories = await getTerritoryOptions();
  return (
    <>
      <PageHeader title="Профиль магазина" actions={<>
        <ButtonLink href="/shop/points" variant="secondary">{t("📍 Мои точки")}</ButtonLink>
        <ButtonLink href="/shop/replacements" variant="secondary">{t("🔁 Замены")}</ButtonLink>
        {owner && <ButtonLink href="/shop/debts" variant="secondary">{t("💰 Задолженность")}</ButtonLink>}
        {owner && <ButtonLink href="/shop/team" variant="secondary">{t("👥 Сотрудники")}</ButtonLink>}
        <ButtonLink href="/shop/documents" variant="secondary">{t("🧾 Документы")}</ButtonLink>
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

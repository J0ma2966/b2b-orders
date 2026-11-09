import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireShopOwner } from "@/lib/auth/current";
import { getTerritoryOptions } from "@/lib/territory";
import { fileUrl } from "@/lib/storage-url";
import { getT } from "@/lib/i18n/server";
import { ShopProfileForm } from "../form";

// Редактирование данных магазина живёт отдельно, внутри «Настроек»: на странице профиля полей ввода нет,
// чтобы случайным касанием не изменить название, ИНН или телефоны. Только владелец.
export default async function ShopProfileEditPage() {
  const [ctx, t] = await Promise.all([requireShopOwner(), getT()]);
  const s = ctx.shop;
  const territories = await getTerritoryOptions();
  return (
    <>
      <Link href="/account" className="mb-3 inline-block text-sm font-semibold text-gray-500">{t("← Настройки")}</Link>
      <PageHeader title="Данные магазина" subtitle="Изменения вступят в силу после нажатия «Сохранить»" />
      <Card className="max-w-3xl">
        {s.photoPaths.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto">
            {s.photoPaths.map((p) => (
              <img key={p} src={fileUrl(p)!} alt="" className="h-24 rounded-2xl object-cover" />
            ))}
          </div>
        )}
        <ShopProfileForm
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
        />
      </Card>
    </>
  );
}

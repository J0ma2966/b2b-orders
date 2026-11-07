import Link from "next/link";
import { Bell, ChevronRight, FileText, MapPin, Pencil, Repeat2, Settings, Truck, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { initials } from "@/components/shop/ui";
import { logoutAction } from "@/app/(auth)/actions";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { getTerritoryOptions } from "@/lib/territory";
import { fileUrl } from "@/lib/storage-url";
import { formatPhone } from "@/lib/phone";
import { ShopProfileForm } from "./form";
import { getT } from "@/lib/i18n/server";

// Профиль магазина в стиле макета: лаймовая шапка, язык, меню разделов, выход, ниже — данные магазина
export default async function ShopProfilePage() {
  const t = await getT();
  const ctx = await requireShop();
  const s = ctx.shop;
  const owner = ctx.membership.role === "OWNER";
  const points = ctx.memberships.length;
  const [territories, territory, suppliers, unread] = await Promise.all([
    getTerritoryOptions(),
    db.territory.findUnique({ where: { id: s.territoryId }, select: { name: true } }),
    db.shopAccount.count({ where: { shopId: s.id } }),
    db.notification.count({ where: { userId: ctx.auth.user.id, readAt: null } }),
  ]);
  const menu: { href: string; icon: LucideIcon; tile: string; title: string; sub?: string; badge?: number; show?: boolean }[] = [
    { href: "/shop/points", icon: MapPin, tile: "bg-tile-yellow", title: t("Мои точки"), sub: [territory?.name, s.address].filter(Boolean).join(", "), badge: points > 1 ? points : undefined },
    { href: "/shop/suppliers", icon: Truck, tile: "bg-tile-blue", title: t("Мои поставщики"), badge: suppliers || undefined },
    { href: "/notifications", icon: Bell, tile: "bg-tile-pink", title: t("Уведомления"), badge: unread || undefined },
    { href: "/shop/replacements", icon: Repeat2, tile: "bg-tile-mint", title: t("Замены") },
    { href: "/shop/team", icon: Users, tile: "bg-tile-violet", title: t("Сотрудники"), show: owner },
    { href: "/shop/documents", icon: FileText, tile: "bg-tile-peach", title: t("Документы") },
    { href: "/account", icon: Settings, tile: "bg-page", title: t("Настройки"), sub: t("Пароль, push-уведомления") },
  ];

  return (
    <div className="space-y-4">
      <section className="relative -mx-4 -mt-[max(1.25rem,env(safe-area-inset-top))] overflow-hidden rounded-b-[2rem] bg-lime px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 text-night md:mx-0 md:mt-0 md:rounded-[2rem] md:px-6">
        <span className="pointer-events-none absolute -top-16 -right-20 size-64 rounded-full border-[2.5rem] border-black/[0.04]" aria-hidden />
        <h1 className="relative pt-2 font-display text-[2rem] leading-tight font-bold tracking-tight">{t("Профиль")}</h1>
        <div className="relative mt-5 flex items-center gap-4">
          <span className="grid size-20 shrink-0 place-items-center rounded-[1.5rem] bg-night font-display text-2xl font-bold text-lime" aria-hidden>
            {initials(s.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-xl leading-tight font-bold">{s.name}</span>
            <span className="mt-1 block truncate text-sm font-medium">
              {t(owner ? "Владелец" : "Сотрудник")} · {formatPhone(ctx.auth.user.phone)}
            </span>
          </span>
          {owner && (
            <a href="#shop-form" aria-label={t("Изменить профиль")} className="grid size-14 shrink-0 place-items-center rounded-full bg-night text-lime">
              <Pencil className="size-5" strokeWidth={2.2} aria-hidden />
            </a>
          )}
        </div>
      </section>

      <section className="rounded-[1.75rem] bg-surface p-4">
        <div className="mb-2.5 text-sm font-semibold text-gray-500">{t("Язык приложения")}</div>
        <LanguageSwitcher wide />
      </section>

      <nav className="divide-y divide-black/[0.06] rounded-[1.75rem] bg-surface px-4" aria-label={t("Разделы")}>
        {menu
          .filter((m) => m.show !== false)
          .map((m) => (
            <Link key={m.href} href={m.href} className="flex items-center gap-3.5 py-3">
              <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl text-night", m.tile)}>
                <m.icon className="size-5" strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{m.title}</span>
                {m.sub && <span className="block truncate text-sm text-gray-500">{m.sub}</span>}
              </span>
              {m.badge ? (
                <span className="grid h-8 min-w-8 place-items-center rounded-full bg-night px-2 text-sm font-bold text-lime tabular-nums">{m.badge > 99 ? "99+" : m.badge}</span>
              ) : (
                <ChevronRight className="size-5 text-gray-400" aria-hidden />
              )}
            </Link>
          ))}
      </nav>

      <form action={logoutAction}>
        <button className="w-full rounded-[1.5rem] bg-coral-soft py-4 font-bold text-red-900">{t("Выйти")}</button>
      </form>

      <section id="shop-form" className="scroll-mt-6 rounded-[1.75rem] bg-surface p-4 sm:p-6">
        <h2 className="mb-4 font-display text-xl font-bold">{t("Данные магазина")}</h2>
        {s.photoPaths.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto">
            {s.photoPaths.map((p) => (
              <img key={p} src={fileUrl(p)!} alt="" className="h-24 rounded-2xl object-cover" />
            ))}
          </div>
        )}
        {!owner ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{s.name}</p>
            <p className="text-gray-600">{s.address}</p>
            <p className="pt-2 text-gray-500">{t("Изменить профиль может только владелец магазина")}</p>
          </div>
        ) : (
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
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { db } from "@/lib/db";
import { liveStamp } from "@/lib/live";
import { LiveRefresh } from "./live-refresh";
import { getAuth } from "@/lib/auth/current";
import { logoutAction } from "@/app/(auth)/actions";
import { stopImpersonationAction } from "@/app/admin/impersonation-actions";
import { getT } from "@/lib/i18n/server";
import { LanguageSwitcher } from "./language-switcher";

// Правая часть шапки: колокольчик, имя, выход. Читает сессию, поэтому рендерится внутри Suspense.
export async function UserMenu() {
  const [auth, t] = await Promise.all([getAuth(), getT()]);
  if (!auth) {
    return (
      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <Link href="/login" className="text-sm text-brand-600">{t("Войти")}</Link>
      </div>
    );
  }
  const [unread, stamp] = await Promise.all([db.notification.count({ where: { userId: auth.user.id, readAt: null } }), liveStamp(auth.user.id)]);
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <LanguageSwitcher />
      <LiveRefresh stamp={stamp} />
      <Link href="/notifications" className="relative grid size-10 place-items-center rounded-full hover:bg-gray-100" aria-label={t("Уведомления")}>
        <Bell className="size-5 text-gray-700" aria-hidden />
        {unread > 0 && (
          <span key={unread} className="badge-pop absolute top-0 right-0 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] leading-5 font-semibold text-white ring-2 ring-surface">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      <Link href="/account" className="hidden max-w-40 truncate text-sm text-gray-700 sm:block">{auth.user.fullName}</Link>
      <form action={logoutAction}>
        <button className="flex items-center gap-1.5 rounded-full p-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 sm:px-3" aria-label={t("Выйти")} title={t("Выйти")}>
          <LogOut className="size-5 sm:size-4" aria-hidden />
          <span className="hidden sm:inline">{t("Выйти")}</span>
        </button>
      </form>
    </div>
  );
}

export async function ImpersonationBanner() {
  const [auth, t] = await Promise.all([getAuth(), getT()]);
  if (!auth?.isImpersonating) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-yellow-300 px-4 py-2 text-sm text-yellow-950">
      <span>
        {t("Вы действуете от имени {name}. Все действия записываются в аудит с вашим именем.", { name: auth.user.fullName })}
      </span>
      <form action={stopImpersonationAction}>
        <button className="rounded bg-yellow-950 px-3 py-1 text-xs font-medium text-yellow-50">{t("Вернуться в админку")}</button>
      </form>
    </div>
  );
}

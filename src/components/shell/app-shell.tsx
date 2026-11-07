import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Building } from "lucide-react";
import { Spinner } from "@/components/ui";
import { Tr } from "@/components/ui/tr";
import { BottomNav, BottomNavView, SideNav, SideNavView, type NavItem } from "./nav-links";
import { ImpersonationBanner, UserMenu } from "./user-menu";

// Каркас кабинета. Статическая часть пререндерится, данные пользователя подгружаются потоком.
export function AppShell({
  title,
  root,
  nav,
  mobileNav,
  bottom,
  side,
  context,
  children,
}: {
  title: string;
  root: string;
  nav: NavItem[];
  mobileNav?: NavItem[];
  // Своя нижняя панель (серверный компонент, например со счётчиками); пока грузится — mobileNav без счётчиков
  bottom?: ReactNode;
  // Своё меню слева (серверный компонент со счётчиками); пока грузится — nav без счётчиков
  side?: ReactNode;
  context?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Suspense>
        <ImpersonationBanner />
      </Suspense>
      <header className="sticky top-0 z-[1001] border-b border-gray-200/70 bg-surface/80 backdrop-blur-xl backdrop-saturate-150" style={{ viewTransitionName: "app-header" }}>
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={root} className="flex min-w-0 items-center gap-2.5 font-semibold text-brand-700 sm:shrink-0">
              <span className="hidden size-9 shrink-0 place-items-center rounded-xl bg-brand-600 sm:grid text-on-brand shadow-sm shadow-brand-700/30" aria-hidden>
                <Building className="size-[18px]" strokeWidth={2.2} />
              </span>
              <span className="truncate"><Tr>{title}</Tr></span>
            </Link>
            {/* На телефоне с нижней панелью место в шапке занимают язык и уведомления; контекст — на экране «Ещё» */}
            {context && <div className={mobileNav ? "hidden min-w-0 sm:block" : "min-w-0"}><Suspense>{context}</Suspense></div>}
          </div>
          <Suspense fallback={<div className="h-8" />}>
            <UserMenu />
          </Suspense>
        </div>
        <div className={mobileNav ? "hidden md:block lg:hidden" : "lg:hidden"}>
          <Suspense fallback={<SideNavView items={nav} root={root} />}>
            {side ?? <SideNav items={nav} root={root} />}
          </Suspense>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-4 sm:py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20">
            <Suspense fallback={<SideNavView items={nav} root={root} />}>
              {side ?? <SideNav items={nav} root={root} />}
            </Suspense>
          </div>
        </aside>
        <main className={mobileNav ? "min-w-0 flex-1 pb-28 md:pb-0" : "min-w-0 flex-1"}>
          <Suspense fallback={<Spinner />}>{children}</Suspense>
        </main>
      </div>
      {mobileNav && (
        <Suspense fallback={<BottomNavView items={mobileNav} root={root} />}>
          {bottom ?? <BottomNav items={mobileNav} root={root} />}
        </Suspense>
      )}
    </div>
  );
}

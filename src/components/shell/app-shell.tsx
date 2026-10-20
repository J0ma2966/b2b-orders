import Link from "next/link";
import { Suspense, type ReactNode } from "react";
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
  context,
  children,
}: {
  title: string;
  root: string;
  nav: NavItem[];
  mobileNav?: NavItem[];
  context?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Suspense>
        <ImpersonationBanner />
      </Suspense>
      <header className="sticky top-0 z-[1001] border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={root} className="shrink-0 font-semibold text-brand-700"><Tr>{title}</Tr></Link>
            {context && <Suspense>{context}</Suspense>}
          </div>
          <Suspense fallback={<div className="h-8" />}>
            <UserMenu />
          </Suspense>
        </div>
        <div className={mobileNav ? "hidden md:block lg:hidden" : "lg:hidden"}>
          <Suspense fallback={<SideNavView items={nav} root={root} />}>
            <SideNav items={nav} root={root} />
          </Suspense>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-4 sm:py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20">
            <Suspense fallback={<SideNavView items={nav} root={root} />}>
              <SideNav items={nav} root={root} />
            </Suspense>
          </div>
        </aside>
        <main className={mobileNav ? "min-w-0 flex-1 pb-20 md:pb-0" : "min-w-0 flex-1"}>
          <Suspense fallback={<Spinner />}>{children}</Suspense>
        </main>
      </div>
      {mobileNav && (
        <Suspense fallback={<BottomNavView items={mobileNav} root={root} />}>
          <BottomNav items={mobileNav} root={root} />
        </Suspense>
      )}
    </div>
  );
}

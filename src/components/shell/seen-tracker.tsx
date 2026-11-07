"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { markSeenAction } from "@/app/(common)/notifications/actions";

// Открыл страницу — уведомления, которые ведут на неё, прочитаны: гаснут счётчики раздела в меню
// и метка «Изменён» на карточке заказа. Если что-то отмечено — перерисовать меню.
const SKIP = ["/login", "/register", "/privacy", "/account-deletion", "/start", "/notifications"];

export function SeenTracker() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!pathname || SKIP.some((p) => pathname === p || pathname.startsWith(p + "/"))) return;
    markSeenAction(pathname)
      .then((n) => n > 0 && router.refresh())
      .catch(() => null);
  }, [pathname, router]);
  return null;
}

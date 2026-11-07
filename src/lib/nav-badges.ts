import "server-only";
import { db } from "@/lib/db";
import { countBySection, mergeMax, withOverflow, type Badges } from "./nav-badges-core";

export type { Badges } from "./nav-badges-core";

// Непрочитанные уведомления пользователя по разделам меню. Уведомление закрывается,
// когда пользователь открывает страницу, на которую оно ведёт (SeenTracker), или из колокольчика.
export async function unreadBySection(userId: string, hrefs: string[], aliases?: Record<string, string>): Promise<Badges> {
  const rows = await db.notification.findMany({
    where: { userId, readAt: null },
    select: { link: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return countBySection(
    rows.map((r) => r.link),
    hrefs,
    aliases,
  );
}

// Магазин: корзина — число позиций, остальные разделы — непрочитанные уведомления.
// На телефоне «Профиль» собирает разделы, которых нет в нижней панели (задолженность, замены, документы).
export async function shopBadges(userId: string, shopId: string, allHrefs: string[], mobileHrefs: string[], overflowHref = "/shop/profile") {
  const [unread, cartItems] = await Promise.all([unreadBySection(userId, allHrefs), db.orderItem.count({ where: { order: { shopId, status: "DRAFT" } } })]);
  // Уведомления о корзине (напоминание «корзина ждёт») корзину не дублируют — там счётчик позиций
  const all: Badges = { ...unread, "/shop/cart": cartItems };
  return { side: all, bottom: withOverflow(all, allHrefs, mobileHrefs, overflowHref) };
}

// Поставщик: «Заказы» — заказы, которые ждут ответа, «Доставки» — свои доставки (если развозит сам);
// остальные разделы и «Ещё» — непрочитанные уведомления
export async function supplierBadges(
  userId: string,
  supplierId: string,
  opts: { active: boolean; delivers: boolean; allHrefs: string[]; mobileHrefs: string[]; overflowHref: string },
) {
  const [unread, waiting, mine] = await Promise.all([
    unreadBySection(userId, opts.allHrefs, { "/courier": "/supplier/delivery" }),
    opts.active ? db.order.count({ where: { supplierId, status: { in: ["PLACED", "NEEDS_CONFIRMATION", "DELIVERY_PROBLEM"] } } }) : 0,
    opts.active && opts.delivers ? db.order.count({ where: { supplierId, courierId: userId, status: { in: ["ASSIGNED", "IN_TRANSIT"] } } }) : 0,
  ]);
  const all = mergeMax(unread, { "/supplier/orders": waiting, "/supplier/delivery": mine });
  return { side: all, bottom: withOverflow(all, opts.allHrefs, opts.mobileHrefs, opts.overflowHref) };
}

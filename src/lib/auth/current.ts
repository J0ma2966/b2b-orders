import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSession } from "./session";
import type { SupplierRole } from "@/generated/prisma/client";

export type Auth = NonNullable<Awaited<ReturnType<typeof loadAuth>>>;

async function loadAuth() {
  const session = await readSession();
  if (!session) return null;
  const realUser = session.user;
  if (realUser.status !== "ACTIVE") return null;
  // «Действие от имени» доступно только супер-администратору
  const impersonated = realUser.isSuperAdmin && session.actingAsUser ? session.actingAsUser : null;
  const user = impersonated ?? realUser;
  return {
    session,
    realUser,
    user,
    isImpersonating: impersonated !== null,
    isSuperAdmin: !impersonated && realUser.isSuperAdmin,
  };
}

// Один запрос к БД на рендер.
export const getAuth = cache(loadAuth);

export async function requireAuth(opts: { allowTempPassword?: boolean } = {}) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  // Пока не сменён временный пароль, доступна только страница смены пароля
  if (auth.realUser.mustChangePassword && !auth.isImpersonating && !opts.allowTempPassword) redirect("/account/password");
  return auth;
}

export async function requireSuperAdmin() {
  const auth = await requireAuth();
  if (!auth.isSuperAdmin) redirect(await homePathFor(auth));
  return auth;
}

// Организация поставщика текущего пользователя (с учётом выбранной в сессии).
export const getSupplierContext = cache(async () => {
  const auth = await getAuth();
  if (!auth) return null;
  const memberships = await db.supplierMember.findMany({
    where: { userId: auth.user.id, isActive: true },
    include: { supplier: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;
  const current =
    memberships.find((m) => m.supplierId === auth.session.activeSupplierId) ?? memberships[0];
  return { auth, membership: current, supplier: current.supplier, memberships };
});

export async function requireSupplier(roles: SupplierRole[] = ["OWNER", "ADMIN"]) {
  const auth = await requireAuth();
  const ctx = await getSupplierContext();
  if (!ctx || !roles.includes(ctx.membership.role)) {
    // Не тот раздел: доставщик уходит в свой кабинет, сотрудник — в кабинет поставщика
    if (ctx) redirect(ctx.membership.role === "COURIER" ? "/courier" : "/supplier");
    redirect(await homePathFor(auth));
  }
  return ctx;
}

export async function requireActiveSupplier(roles: SupplierRole[] = ["OWNER", "ADMIN"]) {
  const ctx = await requireSupplier(roles);
  if (ctx.supplier.status !== "ACTIVE") redirect("/supplier");
  return ctx;
}

export const getShopContext = cache(async () => {
  const auth = await getAuth();
  if (!auth) return null;
  const memberships = await db.shopMember.findMany({
    where: { userId: auth.user.id, isActive: true },
    include: { shop: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;
  const current = memberships.find((m) => m.shopId === auth.session.activeShopId) ?? memberships[0];
  return { auth, membership: current, shop: current.shop, memberships };
});

export async function requireShop() {
  const auth = await requireAuth();
  const ctx = await getShopContext();
  if (!ctx) {
    const home = await homePathFor(auth);
    redirect(home === "/shop" ? "/" : home);
  }
  return ctx;
}

// Куда отправить пользователя после входа.
export async function homePathFor(auth: { isSuperAdmin: boolean; user: { id: string } }) {
  if (auth.isSuperAdmin) return "/admin";
  const supplier = await db.supplierMember.findFirst({
    where: { userId: auth.user.id, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (supplier) return supplier.role === "COURIER" ? "/courier" : "/supplier";
  const shop = await db.shopMember.findFirst({ where: { userId: auth.user.id, isActive: true } });
  if (shop) return "/shop";
  return "/";
}

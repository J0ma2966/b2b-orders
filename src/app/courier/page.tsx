import { EmptyState } from "@/components/ui";
import { DeliveryHero, DeliveryRow } from "@/components/orders/delivery-card";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { DELIVERY_ACTIVE } from "@/lib/order-core";
import { getT } from "@/lib/i18n/server";

// Мои доставки: сегодня и предстоящие (ТЗ п. 74). Сверху — та, которой доставщик занят сейчас.
export default async function CourierHome() {
  const t = await getT();
  const ctx = await requireSupplier(["COURIER"]);
  const orders = await db.order.findMany({
    where: { supplierId: ctx.supplier.id, courierId: ctx.auth.user.id, status: { in: DELIVERY_ACTIVE } },
    include: { shop: true, items: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ deliveryDate: "asc" }, { assignedAt: "asc" }],
  });
  const replacementsByShop = await db.replacement.groupBy({
    by: ["shopId"],
    where: { supplierId: ctx.supplier.id, courierId: ctx.auth.user.id, status: "ASSIGNED" },
    _count: true,
  });
  const repl = new Map(replacementsByShop.map((r) => [r.shopId, r._count]));
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" }) + "T00:00:00Z");
  const now = orders.filter((o) => !o.deliveryDate || o.deliveryDate <= today);
  const later = orders.filter((o) => o.deliveryDate && o.deliveryDate > today);
  // В пути — первой, затем по очереди назначения
  const current = now.find((o) => o.status !== "ASSIGNED") ?? now[0];
  const queue = now.filter((o) => o !== current);
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">{t("Мои доставки")}</h1>
      <p className="mb-4 text-sm text-gray-500">
        {t("Сегодня")} · {now.length}
        {later.length > 0 && ` · ${t("Предстоящие")} · ${later.length}`}
      </p>
      {orders.length === 0 && <EmptyState>{t("Назначенных доставок пока нет")}</EmptyState>}
      {current && <DeliveryHero o={current} replacements={repl.get(current.shopId)} />}
      {queue.length > 0 && (
        <section className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-gray-500">{t("Дальше сегодня")}</h2>
          {queue.map((o) => <DeliveryRow key={o.id} o={o} />)}
        </section>
      )}
      {later.length > 0 && (
        <section className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-gray-500">{t("Предстоящие")}</h2>
          {later.map((o) => <DeliveryRow key={o.id} o={o} />)}
        </section>
      )}
    </>
  );
}

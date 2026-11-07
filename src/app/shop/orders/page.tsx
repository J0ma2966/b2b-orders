import { ExportLink } from "@/components/ui/export-link";
import Link from "next/link";
import { EmptyState, cn } from "@/components/ui";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { ActiveOrderCard, OrderRows, orderMarks } from "@/components/shop/order-tracker";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { orderStatusFilter } from "@/lib/order-core";
import { getT } from "@/lib/i18n/server";
import { FlashToast } from "@/components/ui/toast";

// Заказы магазина (макет): «Активные · N» / «История»; верхний заказ в работе — крупной тёмной карточкой
export default async function ShopOrdersPage({ searchParams }: PageProps<"/shop/orders">) {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  const sp = await searchParams;
  // Старые ссылки с конкретным статусом тоже работают
  const status = typeof sp.status === "string" && sp.status ? sp.status : "active";
  const page = pageFrom(sp);
  const where = { shopId: ctx.shop.id, status: orderStatusFilter(status) };
  const [total, activeCount, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.count({ where: { shopId: ctx.shop.id, status: orderStatusFilter("active") } }),
    db.order.findMany({
      where,
      include: { supplier: true, _count: { select: { items: true } } },
      orderBy: status === "active" ? [{ status: "asc" }, { placedAt: "desc" }] : { placedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  // Крупно — заказ, который уже в пути, иначе самый свежий
  const hero = status === "active" && page === 1 ? (rows.find((o) => o.status === "IN_TRANSIT") ?? rows[0]) : null;
  const rest = rows.filter((o) => o !== hero);
  // Метки «Изменён поставщиком» / «Есть обновления» гаснут, когда заказ открыт
  const marks = await orderMarks(ctx.auth.user.id, rows.map((o) => o.id));
  const tab = (key: string, label: string) => (
    <Link
      href={key === "active" ? "/shop/orders" : `/shop/orders?status=${key}`}
      transitionTypes={["tab"]}
      className={cn("flex-1 rounded-[1.1rem] py-3 text-center font-bold", (key === "active" ? status === "active" : status !== "active") ? "bg-night text-lime" : "text-gray-500")}
    >
      {label}
    </Link>
  );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-1 pt-1">
        <h1 className="font-display text-[2rem] leading-none font-bold tracking-tight">{t("Заказы")}</h1>
        <ExportLink href={`/api/export/shop/orders?status=${status}`} />
      </div>
      <nav className="mb-4 flex rounded-[1.4rem] bg-surface p-1.5">
        {tab("active", `${t("Активные")} · ${activeCount}`)}
        {tab("closed", t("История"))}
      </nav>
      {typeof sp.placed === "string" && Number(sp.placed) > 0 && (
        <FlashToast param="placed" tone="success" title={t("Оформлено заказов: {n}", { n: Number(sp.placed) })} body={t("Товар зарезервирован, поставщики получили уведомления")} />
      )}
      {rows.length === 0 ? (
        <EmptyState>
          {t("Заказов нет.")} <Link href="/shop/suppliers" className="font-semibold text-brand-700 underline">{t("Выбрать поставщика")}</Link>
        </EmptyState>
      ) : (
        <div className="space-y-2.5">
          {hero && <ActiveOrderCard o={hero} mark={marks.get(hero.id)} />}
          <OrderRows rows={rest} marks={marks} />
        </div>
      )}
      <Pagination page={page} total={total} basePath="/shop/orders" params={{ status: status === "active" ? "" : status }} />
    </>
  );
}

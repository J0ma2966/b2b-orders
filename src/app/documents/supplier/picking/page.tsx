import { PrintBar } from "@/components/orders/print-button";
import { db } from "@/lib/db";
import { requireActiveSupplier } from "@/lib/auth/current";
import { formatQty } from "@/lib/catalog";
import { getT } from "@/lib/i18n/server";
import { ordersForPicking, parsePickingParams, pickingSheet } from "@/lib/picking";
import { delivererWhere } from "@/lib/supplier-roles";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Лист сборки") };
}

// П4: сводный лист сборки — товар, сколько всего, по каким магазинам
export default async function PickingPage({ searchParams }: PageProps<"/documents/supplier/picking">) {
  const [ctx, t] = await Promise.all([requireActiveSupplier(), getT()]);
  const f = parsePickingParams(await searchParams);
  const [orders, couriers] = await Promise.all([
    ordersForPicking(ctx.supplier.id, f),
    db.supplierMember.findMany({ where: { supplierId: ctx.supplier.id, ...delivererWhere }, include: { user: true } }),
  ]);
  const lines = pickingSheet(orders);
  const courier = couriers.find((c) => c.userId === f.courierId);
  return (
    <>
      <PrintBar back="/supplier/orders" />
      {!f.ids?.length && (
        <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
          <label className="text-xs text-gray-500">
            {t("Дата доставки")}
            <input type="date" name="date" defaultValue={f.date?.toISOString().slice(0, 10)} className="mt-1 block rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-gray-500">
            {t("Доставщик")}
            <select name="courier" defaultValue={f.courierId ?? ""} className="mt-1 block rounded-md border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">{t("Все")}</option>
              {couriers.map((c) => (
                <option key={c.userId} value={c.userId}>{c.user.fullName}</option>
              ))}
            </select>
          </label>
          <button className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-on-brand">{t("Показать")}</button>
        </form>
      )}
      <h1 className="text-center text-xl font-bold">{t("Лист сборки")}</h1>
      <p className="mt-1 text-center text-gray-600">
        {[
          ctx.supplier.displayName,
          f.date ? t("доставка {date}", { date: t.date(f.date) }) : null,
          courier ? courier.user.fullName : null,
          t("заказов: {n}", { n: orders.length }),
        ].filter(Boolean).join(" · ")}
      </p>
      {lines.length === 0 ? (
        <p className="mt-6 text-center text-gray-500">{t("Нет заказов для сборки")}</p>
      ) : (
        // На телефоне таблица прокручивается сама, страница не уезжает вбок
        <div className="mt-4 overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse border border-gray-400 text-left">
          <thead>
            <tr className="bg-gray-100 text-xs">
              <th className="w-8 border border-gray-400 px-1 py-1">✓</th>
              <th className="border border-gray-400 px-1 py-1">{t("Товар")}</th>
              <th className="border border-gray-400 px-1 py-1 text-right">{t("Всего")}</th>
              <th className="border border-gray-400 px-1 py-1">{t("По магазинам")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={`${l.name}-${l.unit}`} className="break-inside-avoid align-top">
                <td className="border border-gray-400 px-1">☐</td>
                <td className="border border-gray-400 px-1 font-medium">{l.name}</td>
                <td className="border border-gray-400 px-1 text-right whitespace-nowrap font-semibold">{formatQty(l.total)} {t(l.unit)}</td>
                <td className="border border-gray-400 px-1 text-xs">
                  {l.byShop.map((b, i) => (
                    <div key={i}>
                      №{b.number} {b.shop} — {formatQty(b.qty)}{b.bonus ? ` (${t("бонус")})` : ""}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </>
  );
}

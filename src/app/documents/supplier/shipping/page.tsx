import { PrintBar } from "@/components/orders/print-button";
import { requireActiveSupplier } from "@/lib/auth/current";
import { formatQty } from "@/lib/catalog";
import { formatPhone } from "@/lib/phone";
import { ITEM_KIND_LABEL, lineTotal, PAYMENT_LABEL } from "@/lib/order-core";
import { paymentDue } from "@/lib/accounts";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { ordersForPicking, parsePickingParams } from "@/lib/picking";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Накладные на отгрузку") };
}

// П3: накладные на отгрузку для отмеченных заказов, каждая на своей странице
export default async function ShippingPage({ searchParams }: PageProps<"/documents/supplier/shipping">) {
  const [ctx, t] = await Promise.all([requireActiveSupplier(), getT()]);
  const orders = await ordersForPicking(ctx.supplier.id, parsePickingParams(await searchParams));
  const dues = await Promise.all(orders.map((o) => paymentDue(db, { id: o.id, shopId: o.shopId, supplierId: o.supplierId, total: Number(o.total), placedAt: o.placedAt })));
  const s = ctx.supplier;
  return (
    <>
      <PrintBar back="/supplier/orders" />
      {orders.length === 0 && <p className="text-center text-gray-500">{t("Нет заказов для печати")}</p>}
      {orders.map((o, n) => (
        <section key={o.id} className={n < orders.length - 1 ? "mb-10 break-after-page" : ""}>
          <h1 className="text-center text-xl font-bold">{t("НАКЛАДНАЯ НА ОТГРУЗКУ №{n}", { n: o.number })}</h1>
          <div className="mt-4 space-y-1">
            <p><span className="text-gray-500">{t("Поставщик:")}</span> {s.legalName}, {t("ИНН")} {s.inn}, {t("тел.")} {formatPhone(s.phone)}</p>
            <p><span className="text-gray-500">{t("Получатель:")}</span> {o.shop.name}, {o.deliveryAddress}, {t("тел.")} {formatPhone(o.contactPhone ?? o.shop.phone)}</p>
            <p>
              <span className="text-gray-500">{t("Доставка:")}</span> {o.deliveryDate ? t.date(o.deliveryDate) : "—"}
              {o.courier ? `, ${o.courier.fullName}` : ""}
              {o.paymentMethod ? ` · ${t(PAYMENT_LABEL[o.paymentMethod])}` : ""}
            </p>
          </div>
          <table className="mt-4 w-full border-collapse border border-gray-400 text-left">
            <thead>
              <tr className="bg-gray-100 text-xs">
                {["№", "Наименование", "Ед.", "Кол-во", "Цена", "Сумма"].map((h) => (
                  <th key={h} className="border border-gray-400 px-1 py-1">{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {o.items.map((i, k) => (
                <tr key={i.id} className="align-top">
                  <td className="border border-gray-400 px-1">{k + 1}</td>
                  <td className="border border-gray-400 px-1">{i.productName}{i.kind !== "REGULAR" && <span className="text-xs"> ({t(ITEM_KIND_LABEL[i.kind]).toLowerCase()})</span>}</td>
                  <td className="border border-gray-400 px-1">{t(i.unitLabel)}</td>
                  <td className="border border-gray-400 px-1 text-right">{formatQty(i.qty)}</td>
                  <td className="border border-gray-400 px-1 text-right">{i.kind === "BONUS" ? "0" : t.money(i.price)}</td>
                  <td className="border border-gray-400 px-1 text-right">{t.money(i.kind === "BONUS" ? 0 : lineTotal(Number(i.price), Number(i.qty)))}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td colSpan={5} className="border border-gray-400 px-1 text-right">{t("Итого")}</td>
                <td className="border border-gray-400 px-1 text-right">{t.money(o.total)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 font-medium">{t("Получить при доставке не менее: {sum}", { sum: t.money(dues[n].required) })}</p>
          <div className="mt-10 grid grid-cols-2 gap-8">
            <div>{t("Отпустил:")} ____________</div>
            <div>{t("Получил:")} ____________ {o.contactName}</div>
          </div>
        </section>
      ))}
    </>
  );
}

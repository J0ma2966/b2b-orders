import { PrintBar } from "@/components/orders/print-button";
import { balanceLabel } from "@/components/orders/order-view";
import { formatQty } from "@/lib/catalog";
import { ITEM_KIND_LABEL, lineTotal, PAYMENT_LABEL } from "@/lib/order-core";
import { loadDocumentOrder } from "@/lib/order-document";
import { getT } from "@/lib/i18n/server";
import { Tr } from "@/components/ui/tr";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Чек") };
}

// Чек (ТЗ п. 36)
export default async function ReceiptPage({ params }: PageProps<"/documents/orders/[id]/receipt">) {
  const t = await getT();
  const { id } = await params;
  const { order: o, balance } = await loadDocumentOrder(id);
  const correction = Number(o.correctionTotal);
  return (
    <>
      <PrintBar back={`/shop/orders/${o.id}`} />
      <h1 className="text-center text-xl font-bold">{t("ЧЕК к заказу №{n}", { n: o.number })}</h1>
      <p className="text-center text-gray-600">{t.dateTime(o.completedAt)}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div><div className="text-xs text-gray-500">{t("Поставщик")}</div><div className="font-medium">{o.supplier.legalName}</div><div>{t("ИНН")} {o.supplier.inn}</div></div>
        <div><div className="text-xs text-gray-500">{t("Магазин")}</div><div className="font-medium">{o.shop.name}</div><div>{o.deliveryAddress}</div></div>
      </div>
      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-400 text-xs">
            <th className="py-1">{t("Товар")}</th><th className="py-1 text-right">{t("Заказано")}</th><th className="py-1 text-right">{t("Принято")}</th><th className="py-1 text-right">{t("Цена")}</th><th className="py-1 text-right">{t("Сумма")}</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id} className="border-b border-gray-200 align-top">
              <td className="py-1">
                {i.productName}, {t(i.unitLabel)}
                {i.kind !== "REGULAR" && <div className="text-xs text-gray-600">{t(ITEM_KIND_LABEL[i.kind])}{i.bonusPromotion ? `: ${i.bonusPromotion.name}` : ""}</div>}
              </td>
              <td className="py-1 text-right">{formatQty(i.qty)}</td>
              <td className="py-1 text-right">{formatQty(i.acceptedQty ?? 0)}</td>
              <td className="py-1 text-right">{i.kind === "BONUS" ? "0" : t.money(i.price)}</td>
              <td className="py-1 text-right">{t.money(i.kind === "BONUS" ? 0 : lineTotal(Number(i.price), Number(i.acceptedQty ?? 0)))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-4 ml-auto max-w-sm space-y-1">
        <Row k="Итого по принятому" v={t.money(o.total)} bold />
        {correction !== 0 && <Row k="Корректировки" v={`${correction > 0 ? "+" : ""}${t.money(correction)}`} />}
        <Row k="Способ оплаты" v={o.receivedMethod ? t(PAYMENT_LABEL[o.receivedMethod]) : "—"} />
        <Row k="Фактически получено" v={t.money(o.receivedAmount)} />
        {Number(o.paidToDebt) > 0 && <Row k="Из них в погашение долга" v={t.money(o.paidToDebt)} />}
        {Number(o.overpaid) > 0 && <Row k="Переплата" v={t.money(o.overpaid)} />}
        <Row k="Долг по заказу" v={t.money(o.orderDebt)} />
        <Row k="Общая задолженность магазина" v={balanceLabel(balance, t)} bold />
      </dl>
      <p className="mt-6 border-t border-gray-300 pt-2 text-xs text-gray-600">
        {t("Получение подтверждено магазином по QR-коду {date}. Доставщик: {courier}.", { date: t.dateTime(o.qrUsedAt), courier: o.courier?.fullName ?? "—" })}{" "}
        {t("Платформа фиксирует оплату, но не проводит платежи.")}
      </p>
    </>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={bold ? "flex justify-between font-semibold" : "flex justify-between"}>
      <dt><Tr>{k}</Tr></dt>
      <dd>{v}</dd>
    </div>
  );
}

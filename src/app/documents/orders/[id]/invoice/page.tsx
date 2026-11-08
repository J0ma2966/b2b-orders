import { PrintBar } from "@/components/orders/print-button";
import { formatQty } from "@/lib/catalog";
import { formatPhone } from "@/lib/phone";
import { ITEM_KIND_LABEL, lineTotal } from "@/lib/order-core";
import { loadDocumentOrder } from "@/lib/order-document";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Накладная") };
}

// Накладная (ТЗ п. 37): фактически переданное и принятое количество
export default async function InvoicePage({ params }: PageProps<"/documents/orders/[id]/invoice">) {
  const t = await getT();
  const { id } = await params;
  const { order: o } = await loadDocumentOrder(id);
  return (
    <>
      <PrintBar back={`/shop/orders/${o.id}`} />
      <h1 className="text-center text-xl font-bold">{t("НАКЛАДНАЯ №{n} от {date}", { n: o.number, date: t.date(o.completedAt) })}</h1>
      <div className="mt-4 space-y-1">
        <p><span className="text-gray-500">{t("Поставщик:")}</span> {o.supplier.legalName}, {t("ИНН")} {o.supplier.inn}, {o.supplier.legalAddress}, {t("тел.")} {formatPhone(o.supplier.phone)}</p>
        <p><span className="text-gray-500">{t("Получатель:")}</span> {o.shop.name}{o.shop.inn ? `, ${t("ИНН")} ${o.shop.inn}` : ""}, {o.deliveryAddress}, {t("тел.")} {formatPhone(o.contactPhone ?? o.shop.phone)}</p>
      </div>
      <table className="mt-4 w-full border-collapse border border-gray-400 text-left">
        <thead>
          <tr className="bg-gray-100 text-xs">
            {["№", "Наименование", "Ед.", "Заказано", "Передано", "Принято", "Не принято", "Цена", "Сумма"].map((h) => (
              <th key={h} className="border border-gray-400 px-1 py-1">{t(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {o.items.map((i, n) => {
            const acc = Number(i.acceptedQty ?? 0);
            return (
              <tr key={i.id} className="align-top">
                <td className="border border-gray-400 px-1">{n + 1}</td>
                <td className="border border-gray-400 px-1">{i.productName}{i.kind !== "REGULAR" && <span className="text-xs"> ({t(ITEM_KIND_LABEL[i.kind]).toLowerCase()})</span>}</td>
                <td className="border border-gray-400 px-1">{t(i.unitLabel)}</td>
                <td className="border border-gray-400 px-1 text-right">{formatQty(i.qty)}</td>
                <td className="border border-gray-400 px-1 text-right">{formatQty(i.deliveredQty ?? i.qty)}</td>
                <td className="border border-gray-400 px-1 text-right">{formatQty(acc)}</td>
                <td className="border border-gray-400 px-1 text-right">{formatQty(Number(i.qty) - acc)}</td>
                <td className="border border-gray-400 px-1 text-right">{i.kind === "BONUS" ? "0" : t.money(i.price)}</td>
                <td className="border border-gray-400 px-1 text-right">{t.money(i.kind === "BONUS" ? 0 : lineTotal(Number(i.price), acc))}</td>
              </tr>
            );
          })}
          <tr className="font-semibold">
            <td colSpan={8} className="border border-gray-400 px-1 text-right">{t("Итого")}</td>
            <td className="border border-gray-400 px-1 text-right">{t.money(o.total)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-10 grid grid-cols-2 gap-8">
        <div>{t("Передал:")} ____________ {t.person(o.courier?.fullName)}</div>
        <div>{t("Принял:")} ____________ {o.contactName}</div>
      </div>
    </>
  );
}

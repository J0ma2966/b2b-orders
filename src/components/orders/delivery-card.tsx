import Link from "next/link";
import { Card } from "@/components/ui";
import { formatQty } from "@/lib/catalog";
import { formatDate, formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { ITEM_KIND_LABEL } from "@/lib/order-core";
import { OrderStatusBadge } from "./order-view";
import type { OrderItemKind, OrderStatus } from "@/generated/prisma/enums";

type Card = {
  id: string;
  number: number | null;
  status: OrderStatus;
  deliveryAddress: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  contactName: string | null;
  contactPhone: string | null;
  deliveryDate: Date | null;
  comment: string | null;
  total: { toString(): string };
  shop: { name: string };
  items: { id: string; productName: string; unitLabel: string; qty: { toString(): string }; kind: OrderItemKind }[];
};

export function mapLinks(lat: number, lng: number) {
  return {
    yandex: `https://yandex.ru/maps/?pt=${lng},${lat}&z=17&l=map`,
    google: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    geo: `geo:${lat},${lng}?q=${lat},${lng}`,
  };
}

// Карточка доставки (ТЗ п. 29–30): навигация передаётся во внешние карты.
export function DeliveryCard({ o, href, replacements = 0 }: { o: Card; href?: string; replacements?: number }) {
  const links = o.deliveryLat && o.deliveryLng ? mapLinks(o.deliveryLat, o.deliveryLng) : null;
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{href ? <Link href={href} className="hover:underline">№{o.number} · {o.shop.name}</Link> : <>№{o.number} · {o.shop.name}</>}</div>
          <div className="text-sm text-gray-600">{o.deliveryAddress}</div>
        </div>
        <OrderStatusBadge status={o.status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a className="text-brand-600" href={`tel:${o.contactPhone}`}>📞 {o.contactName}, {formatPhone(o.contactPhone ?? "")}</a>
        {links && (
          <>
            <a className="text-brand-600" href={links.yandex} target="_blank" rel="noreferrer">🗺️ Яндекс Карты</a>
            <a className="text-brand-600" href={links.google} target="_blank" rel="noreferrer">Google Maps</a>
            <a className="text-brand-600" href={links.geo}>Навигатор</a>
          </>
        )}
        {o.deliveryDate && <span>📅 {formatDate(o.deliveryDate)}</span>}
      </div>
      {links && <div className="mt-1 text-xs text-gray-500">Координаты: {o.deliveryLat!.toFixed(6)}, {o.deliveryLng!.toFixed(6)}</div>}
      <ul className="mt-3 divide-y divide-gray-100 text-sm">
        {o.items.map((i) => (
          <li key={i.id} className="flex justify-between py-1.5">
            <span>{i.productName}{i.kind !== "REGULAR" && <span className="text-xs text-gray-500"> · {ITEM_KIND_LABEL[i.kind]}</span>}</span>
            <span className="shrink-0">{formatQty(i.qty)} {i.unitLabel}</span>
          </li>
        ))}
      </ul>
      {replacements > 0 && <p className="mt-2 text-sm text-yellow-700">🔁 Замен для этого магазина: {replacements}</p>}
      {o.comment && <p className="mt-2 text-sm text-gray-700">💬 {o.comment}</p>}
      <div className="mt-2 text-right font-semibold">Сумма: {formatMoney(o.total)}</div>
    </Card>
  );
}

import Link from "next/link";
import { Navigation, PackageOpen, Phone } from "lucide-react";
import { cn } from "@/components/ui";
import { formatQty } from "@/lib/catalog";
import { formatPhone } from "@/lib/phone";
import { ITEM_KIND_LABEL } from "@/lib/order-core";
import { OrderStatusBadge } from "./order-view";
import type { OrderItemKind, OrderStatus } from "@/generated/prisma/enums";
import { getT } from "@/lib/i18n/server";

type Delivery = {
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

const tile = "flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-center text-sm font-semibold";

// Крупные кнопки «позвонить» и «маршрут»: доставщик нажимает их на ходу, часто одной рукой.
// Навигация передаётся во внешние карты (ТЗ п. 29–30).
export function DeliveryActions({ o, open }: { o: Delivery; open?: string }) {
  return <ActionTiles phone={o.contactPhone} lat={o.deliveryLat} lng={o.deliveryLng} open={open} />;
}

export async function ActionTiles({ phone, lat, lng, open }: { phone: string | null; lat: number | null; lng: number | null; open?: string }) {
  const t = await getT();
  const links = lat && lng ? mapLinks(lat, lng) : null;
  return (
    <div className={cn("grid gap-2", open ? "grid-cols-3" : "grid-cols-2")}>
      {phone && (
        <a href={`tel:${phone}`} className={cn(tile, "bg-gray-100 text-ink hover:bg-gray-200")}>
          <Phone className="size-6" strokeWidth={2} aria-hidden />
          {t("Позвонить")}
        </a>
      )}
      {links && (
        <a href={links.yandex} target="_blank" rel="noreferrer" className={cn(tile, "bg-gray-100 text-ink hover:bg-gray-200")}>
          <Navigation className="size-6" strokeWidth={2} aria-hidden />
          {t("Маршрут")}
        </a>
      )}
      {open && (
        <Link href={open} className={cn(tile, "bg-brand-600 text-on-brand hover:bg-brand-500")}>
          <PackageOpen className="size-6" strokeWidth={2} aria-hidden />
          {t("Открыть")}
        </Link>
      )}
    </div>
  );
}

// Главная карточка: доставка, которой доставщик занят сейчас
export async function DeliveryHero({ o, replacements = 0 }: { o: Delivery; replacements?: number }) {
  const t = await getT();
  const count = o.items.length;
  return (
    <section className="animate-rise rounded-3xl bg-surface bg-[radial-gradient(120%_80%_at_100%_0%,rgb(255_210_31/0.10),transparent_60%)] p-5 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.5)] ring-2 ring-brand-600">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-500">№{o.number}</span>
        <OrderStatusBadge status={o.status} />
      </div>
      <h2 className="mt-2 text-2xl leading-tight font-bold">{o.shop.name}</h2>
      <p className="mt-1 text-lg leading-snug text-gray-700">{o.deliveryAddress}</p>
      {o.contactName && (
        <p className="mt-1 text-sm text-gray-500">
          {o.contactName}
          {o.contactPhone && `, ${formatPhone(o.contactPhone)}`}
        </p>
      )}
      {o.comment && <p className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">💬 {o.comment}</p>}
      {replacements > 0 && <p className="mt-2 text-sm font-medium text-yellow-700">{t("🔁 Замен для этого магазина: {n}", { n: replacements })}</p>}
      <div className="mt-3 flex items-baseline justify-between text-sm text-gray-500">
        <span>
          {count} {t.plural(count, "позиция", "позиции", "позиций")}
        </span>
        <span className="text-xl font-bold text-ink tabular-nums">{t.money(o.total)}</span>
      </div>
      <div className="mt-4">
        <DeliveryActions o={o} open={`/courier/orders/${o.id}`} />
      </div>
    </section>
  );
}

// Строка очереди: следующие доставки, история
export async function DeliveryRow({ o }: { o: Pick<Delivery, "id" | "number" | "status" | "deliveryAddress" | "deliveryDate" | "total" | "shop"> }) {
  const t = await getT();
  return (
    <Link href={`/courier/orders/${o.id}`} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 ring-1 ring-gray-200 hover:ring-brand-600">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 text-xs font-semibold text-gray-500">№{o.number}</span>
          <span className="truncate font-semibold">{o.shop.name}</span>
        </div>
        <div className="truncate text-sm text-gray-500">{o.deliveryAddress}</div>
        {o.deliveryDate && <div className="mt-0.5 text-xs text-gray-500">📅 {t.date(o.deliveryDate)}</div>}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-bold tabular-nums">{t.money(o.total)}</div>
        <div className="mt-1"><OrderStatusBadge status={o.status} /></div>
      </div>
    </Link>
  );
}

// Что везти: список позиций крупным шрифтом
export async function DeliveryItems({ items }: { items: Delivery["items"] }) {
  const t = await getT();
  return (
    <ul className="divide-y divide-gray-200">
      {items.map((i) => (
        <li key={i.id} className="flex items-start justify-between gap-3 py-2.5">
          <span>
            {i.productName}
            {i.kind !== "REGULAR" && <span className="ml-1 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800">{t(ITEM_KIND_LABEL[i.kind])}</span>}
          </span>
          <span className="shrink-0 text-lg font-bold tabular-nums">
            {formatQty(i.qty)} <span className="text-sm font-medium text-gray-500">{t(i.unitLabel)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Другие карты и координаты — если Яндекс не подходит
export async function OtherMapLinks({ lat, lng }: { lat: number | null; lng: number | null }) {
  const t = await getT();
  if (!lat || !lng) return null;
  const links = mapLinks(lat, lng);
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <a className="text-brand-600 underline-offset-2 hover:underline" href={links.google} target="_blank" rel="noreferrer">Google Maps</a>
      <a className="text-brand-600 underline-offset-2 hover:underline" href={links.geo}>{t("Навигатор")}</a>
      <span className="text-gray-500 tabular-nums">{t("Координаты: {lat}, {lng}", { lat: lat.toFixed(6), lng: lng.toFixed(6) })}</span>
    </p>
  );
}

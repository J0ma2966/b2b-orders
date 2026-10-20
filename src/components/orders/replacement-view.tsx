import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card } from "@/components/ui";
import { formatQty } from "@/lib/catalog";
import { formatDateTime } from "@/lib/format";
import { REPLACEMENT_STATUS_COLOR, REPLACEMENT_STATUS_LABEL } from "@/lib/replacement-core";
import { fileUrl } from "@/lib/storage-url";
import type { ReplacementStatus } from "@/generated/prisma/enums";

type Row = {
  id: string;
  number: number;
  status: ReplacementStatus;
  productName: string;
  unitLabel: string;
  qty: { toString(): string };
  reason: string;
  createdAt: Date;
  shop?: { name: string };
  order: { number: number | null };
};

export function ReplacementList({ rows, href, extra }: { rows: Row[]; href?: (id: string) => string; extra?: (r: Row) => ReactNode }) {
  return (
    <Card className="p-0 sm:p-0">
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => {
          const body = (
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">№{r.number} · {r.productName} — {formatQty(r.qty)} {r.unitLabel}</div>
                <div className="text-xs text-gray-500">
                  {r.reason} · заказ №{r.order.number}{r.shop ? ` · ${r.shop.name}` : ""} · {formatDateTime(r.createdAt)}
                </div>
              </div>
              <Badge color={REPLACEMENT_STATUS_COLOR[r.status]}>{REPLACEMENT_STATUS_LABEL[r.status]}</Badge>
            </div>
          );
          return (
            <li key={r.id} className="px-4 py-3">
              {href ? <Link href={href(r.id)} className="block hover:opacity-80">{body}</Link> : body}
              {extra?.(r)}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function Media({ photos, videos }: { photos: string[]; videos: string[] }) {
  if (photos.length + videos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p) => (
        <a key={p} href={fileUrl(p)!} target="_blank" rel="noreferrer"><img src={fileUrl(p)!} alt="" className="size-24 rounded-lg object-cover ring-1 ring-gray-200" /></a>
      ))}
      {videos.map((v) => <video key={v} src={fileUrl(v)!} controls className="h-40 rounded-lg bg-black" />)}
    </div>
  );
}

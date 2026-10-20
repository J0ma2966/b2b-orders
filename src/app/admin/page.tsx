import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";

export default async function AdminDashboard() {
  await requireSuperAdmin();
  const [suppliers, shops, antifraud] = await Promise.all([
    db.supplier.groupBy({ by: ["status"], _count: true }),
    db.shop.groupBy({ by: ["status"], _count: true }),
    db.antifraudEvent.count({ where: { status: "OPEN" } }),
  ]);
  const s = Object.fromEntries(suppliers.map((r) => [r.status, r._count]));
  const sh = Object.fromEntries(shops.map((r) => [r.status, r._count]));
  const tiles = [
    { label: "Заявки на проверке", value: (s.PENDING ?? 0) + (s.NEEDS_INFO ?? 0), href: "/admin/suppliers?status=PENDING", accent: true },
    { label: "Антифрод: новые события", value: antifraud, href: "/admin/antifraud", accent: true },
    { label: "Активные поставщики", value: s.ACTIVE ?? 0, href: "/admin/suppliers?status=ACTIVE" },
    { label: "Заблокированные поставщики", value: s.BLOCKED ?? 0, href: "/admin/suppliers?status=BLOCKED" },
    { label: "Новые магазины", value: sh.NEW ?? 0, href: "/admin/shops?status=NEW" },
    { label: "Проверенные магазины", value: sh.VERIFIED ?? 0, href: "/admin/shops?status=VERIFIED" },
    { label: "Не прошли проверку", value: sh.FAILED_CHECK ?? 0, href: "/admin/shops?status=FAILED_CHECK" },
  ];
  return (
    <>
      <PageHeader title="Обзор" subtitle="Заказы, обороты и комиссия появятся на следующих этапах" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className={t.accent && t.value > 0 ? "ring-2 ring-yellow-400" : "hover:ring-gray-300"}>
              <div className="text-2xl font-semibold sm:text-3xl">{t.value}</div>
              <div className="mt-1 text-sm text-gray-500">{t.label}</div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

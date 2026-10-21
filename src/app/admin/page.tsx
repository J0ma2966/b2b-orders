import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { periodRange } from "@/lib/report-core";
import { getT } from "@/lib/i18n/server";
import { jobSettings } from "@/lib/jobs";

export default async function AdminDashboard() {
  await requireSuperAdmin();
  const t = await getT();
  const month = periodRange("month", new Date());
  const now = new Date().getTime();
  const jobs = await jobSettings();
  const remindH = jobs.placedRemindHours || 2;
  const [suppliers, shops, antifraud, active, monthSales, debt, replacements] = await Promise.all([
    db.supplier.groupBy({ by: ["status"], _count: true }),
    db.shop.groupBy({ by: ["status"], _count: true }),
    db.antifraudEvent.count({ where: { status: "OPEN" } }),
    db.order.count({ where: { status: { in: ["PLACED", "ACCEPTED", "ASSEMBLING", "READY", "ASSIGNED", "IN_TRANSIT", "DELIVERY_PROBLEM", "NEEDS_CONFIRMATION"] } } }),
    db.order.findMany({ where: { status: { in: ["COMPLETED", "PARTIALLY_ACCEPTED"] }, completedAt: { gte: month.from, lt: month.to } }, select: { total: true, correctionTotal: true, commissionRate: true } }),
    db.shopAccount.aggregate({ where: { balance: { gt: 0 } }, _sum: { balance: true } }),
    db.replacement.count({ where: { status: "NEW" } }),
  ]);
  // А2: что требует внимания администратора
  const [stalePlaced, staleProblems, overdueInvoices] = await Promise.all([
    db.order.count({ where: { status: "PLACED", placedAt: { lt: new Date(now - remindH * 3_600_000) } } }),
    db.order.count({ where: { status: "DELIVERY_PROBLEM", problemAt: { lt: new Date(now - 24 * 3_600_000) } } }),
    db.commissionInvoice.count({ where: { status: "ISSUED", dueDate: { lt: new Date(now) } } }),
  ]);
  const turnover = monthSales.reduce((sum, o) => sum + Number(o.total) + Number(o.correctionTotal), 0);
  const commission = monthSales.reduce((sum, o) => sum + ((Number(o.total) + Number(o.correctionTotal)) * Number(o.commissionRate ?? 0)) / 100, 0);
  const s = Object.fromEntries(suppliers.map((r) => [r.status, r._count]));
  const sh = Object.fromEntries(shops.map((r) => [r.status, r._count]));
  const attention = [
    { label: `Заказы без ответа поставщика больше ${remindH} ч`, value: stalePlaced, href: "/admin/orders?status=PLACED" },
    { label: "Проблемы доставки дольше суток", value: staleProblems, href: "/admin/orders?status=DELIVERY_PROBLEM" },
    { label: "Заявки поставщиков на проверке", value: (s.PENDING ?? 0) + (s.NEEDS_INFO ?? 0), href: "/admin/suppliers?status=PENDING" },
    { label: "Неразобранный антифрод", value: antifraud, href: "/admin/antifraud" },
    { label: "Просроченные счета на комиссию", value: overdueInvoices, href: "/admin/commissions" },
  ].filter((a) => a.value > 0);
  const tiles = [
    { label: "Заявки на проверке", value: (s.PENDING ?? 0) + (s.NEEDS_INFO ?? 0), href: "/admin/suppliers?status=PENDING", accent: true },
    { label: "Антифрод: новые события", value: antifraud, href: "/admin/antifraud", accent: true },
    { label: "Заказы в работе", value: active, href: "/admin/orders?status=active" },
    { label: "Оборот за месяц", value: t.money(turnover), href: "/admin/reports" },
    { label: "Комиссия за месяц", value: t.money(commission), href: "/admin/commissions" },
    { label: "Долг магазинов", value: t.money(debt._sum.balance ?? 0), href: "/admin/finance" },
    { label: "Замены на рассмотрении", value: replacements, href: "/admin/replacements?status=NEW" },
    { label: "Активные поставщики", value: s.ACTIVE ?? 0, href: "/admin/suppliers?status=ACTIVE" },
    { label: "Заблокированные поставщики", value: s.BLOCKED ?? 0, href: "/admin/suppliers?status=BLOCKED" },
    { label: "Новые магазины", value: sh.NEW ?? 0, href: "/admin/shops?status=NEW" },
    { label: "Проверенные магазины", value: sh.VERIFIED ?? 0, href: "/admin/shops?status=VERIFIED" },
    { label: "Не прошли проверку", value: sh.FAILED_CHECK ?? 0, href: "/admin/shops?status=FAILED_CHECK" },
  ];
  return (
    <>
      <PageHeader title="Обзор" />
      <Card className="mb-4">
        <h2 className="mb-2 font-semibold">{t("Требует внимания")}</h2>
        {attention.length === 0 ? (
          <p className="text-sm text-gray-500">{t("Всё в порядке")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {attention.map((a) => (
              <li key={a.href}>
                <Link href={a.href} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-brand-700">
                  <span>{t(a.label)}</span>
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 font-semibold text-red-700">{a.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href}>
            <Card className={tile.accent && Number(tile.value) > 0 ? "ring-2 ring-yellow-400" : "hover:ring-gray-300"}>
              <div className="text-2xl font-semibold sm:text-3xl">{tile.value}</div>
              <div className="mt-1 text-sm text-gray-500">{t(tile.label)}</div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

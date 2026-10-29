import Link from "next/link";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { SUPPLIER_ROLE_LABEL, SUPPLIER_STATUS_COLOR, SUPPLIER_STATUS_LABEL, supplierTransition } from "@/lib/statuses";
import { resubmitSupplierAction } from "./actions";
import { getT } from "@/lib/i18n/server";
import { accountState } from "@/lib/accounts";
import { lowStockUnitIds } from "@/lib/stock";

export default async function SupplierHome() {
  const t = await getT();
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const s = ctx.supplier;
  const [members, territories, orders] = await Promise.all([
    db.supplierMember.groupBy({ by: ["role"], where: { supplierId: s.id, isActive: true }, _count: true }),
    db.supplierTerritory.count({ where: { supplierId: s.id } }),
    db.order.groupBy({ by: ["status"], where: { supplierId: s.id, status: { in: ["PLACED", "ACCEPTED", "ASSEMBLING", "READY", "ASSIGNED", "IN_TRANSIT"] } }, _count: true }),
  ]);
  const byStatus = Object.fromEntries(orders.map((o) => [o.status, o._count])) as Record<string, number>;
  const todo = s.status === "ACTIVE" ? await todoList(s.id, ctx.membership.delivers ? ctx.auth.user.id : null) : [];
  const inWork = (byStatus.ACCEPTED ?? 0) + (byStatus.ASSEMBLING ?? 0) + (byStatus.ASSIGNED ?? 0) + (byStatus.IN_TRANSIT ?? 0);
  const count = Object.fromEntries(members.map((m) => [m.role, m._count]));
  const canResubmit = supplierTransition("resubmit", s.status) !== null;
  return (
    <>
      <PageHeader
        title={s.displayName}
        subtitle={
          <span className="flex items-center gap-2">
            <Badge color={SUPPLIER_STATUS_COLOR[s.status]}>{SUPPLIER_STATUS_LABEL[s.status]}</Badge>
            <span>{t("Вы: {role}", { role: t(SUPPLIER_ROLE_LABEL[ctx.membership.role]) })}</span>
          </span>
        }
      />
      <div className="space-y-4">
        {s.status === "PENDING" && (
          <Alert tone="warning">{t("Заявка на проверке у администратора платформы. Мы пришлём уведомление, когда её рассмотрят. Пока можно заполнить профиль и добавить сотрудников.")}</Alert>
        )}
        {s.status === "NEEDS_INFO" && (
          <Alert tone="warning">
            <p className="font-medium">{t("Администратор просит дополнить сведения:")}</p>
            <p className="mt-1">{s.moderationComment}</p>
            <p className="mt-2"><Link className="underline" href="/supplier/profile">{t("Исправьте профиль и отправьте заявку снова.")}</Link></p>
          </Alert>
        )}
        {s.status === "REJECTED" && (
          <Alert tone="error">
            <p className="font-medium">{t("Заявка отклонена.")}</p>
            {s.moderationComment && <p className="mt-1">{t("Причина: {reason}", { reason: s.moderationComment })}</p>}
          </Alert>
        )}
        {s.status === "BLOCKED" && (
          <Alert tone="error">
            {t("Компания заблокирована.")} {s.moderationComment && `${t("Причина: {reason}", { reason: s.moderationComment })}. `}{t("Обратитесь к администратору платформы.")}
          </Alert>
        )}
        {canResubmit && (
          <form action={resubmitSupplierAction}>
            <SubmitButton>{t("Отправить заявку на проверку")}</SubmitButton>
          </form>
        )}
        {s.status === "ACTIVE" && (
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <Link href="/supplier/orders?status=PLACED"><Card className={byStatus.PLACED ? "ring-brand-500" : ""}><div className="text-2xl font-semibold">{byStatus.PLACED ?? 0}</div><div className="text-sm text-gray-500">{t("Новые заказы")}</div></Card></Link>
            <Link href="/supplier/orders?status=active"><Card><div className="text-2xl font-semibold">{inWork}</div><div className="text-sm text-gray-500">{t("В работе")}</div></Card></Link>
            <Link href="/supplier/orders?status=READY"><Card><div className="text-2xl font-semibold">{byStatus.READY ?? 0}</div><div className="text-sm text-gray-500">{t("Ждут доставщика")}</div></Card></Link>
          </div>
        )}
        {s.status === "ACTIVE" && (
          <Card>
            <h2 className="mb-2 font-semibold">{t("Сделать сейчас")}</h2>
            {todo.length === 0 ? (
              <p className="text-sm text-gray-500">{t("Срочных дел нет")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {todo.map((i) => (
                  <li key={i.href}>
                    <Link href={i.href} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-brand-700">
                      <span>{t(i.label)}</span>
                      <span className={i.urgent ? "rounded-full bg-red-100 px-2.5 py-0.5 font-semibold text-red-700" : "rounded-full bg-gray-100 px-2.5 py-0.5 font-semibold"}>{i.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <Link href="/supplier/team"><Card><div className="text-2xl font-semibold">{count.ADMIN ?? 0}</div><div className="text-sm text-gray-500">{t("Администраторы")}</div></Card></Link>
          <Link href="/supplier/delivery"><Card><div className="text-2xl font-semibold">{count.COURIER ?? 0}</div><div className="text-sm text-gray-500">{t("Доставщики")}</div></Card></Link>
          <Link href="/supplier/territory"><Card><div className="text-2xl font-semibold">{territories}</div><div className="text-sm text-gray-500">{t("Территорий доставки")}</div></Card></Link>
        </div>
      </div>
    </>
  );
}

// П1: «Сделать сейчас» — что ждёт решения поставщика, со ссылками
async function todoList(supplierId: string, selfDeliverer: string | null) {
  const [placed, problems, cancelRequests, replacements, low, debtAccounts, overdueInvoices, ready, mine] = await Promise.all([
    db.order.count({ where: { supplierId, status: "PLACED" } }),
    db.order.count({ where: { supplierId, status: "DELIVERY_PROBLEM" } }),
    db.order.count({ where: { supplierId, status: "NEEDS_CONFIRMATION" } }),
    db.replacement.count({ where: { supplierId, status: "NEW" } }),
    lowStockUnitIds(supplierId),
    db.shopAccount.findMany({ where: { supplierId, paymentTermDays: { not: null }, balance: { gt: 0 } }, select: { shopId: true }, take: 300 }),
    db.commissionInvoice.count({ where: { supplierId, status: "ISSUED", dueDate: { lt: new Date() } } }),
    db.order.count({ where: { supplierId, status: "READY" } }),
    selfDeliverer ? db.order.count({ where: { supplierId, courierId: selfDeliverer, status: { in: ["ASSIGNED", "IN_TRANSIT"] } } }) : 0,
  ]);
  const states = await Promise.all(debtAccounts.map((a) => accountState(db, a.shopId, supplierId)));
  const overdue = states.filter((st) => (st.aging?.overdueAmount ?? 0) > 0).length;
  const items = [
    { label: "Новые заказы ждут ответа", count: placed, href: "/supplier/orders?status=PLACED", urgent: true },
    { label: "Проблемы доставки", count: problems, href: "/supplier/orders?status=DELIVERY_PROBLEM", urgent: true },
    { label: "Магазины просят отменить заказ", count: cancelRequests, href: "/supplier/orders?status=NEEDS_CONFIRMATION", urgent: true },
    { label: "Готовы к доставке, доставщик не назначен", count: ready, href: "/supplier/orders?status=READY", urgent: false },
    { label: "Мои доставки", count: mine, href: "/courier", urgent: false },
    { label: "Заявки на замену", count: replacements, href: "/supplier/replacements?status=NEW", urgent: false },
    { label: "Просроченные долги магазинов", count: overdue, href: "/supplier/shops", urgent: true },
    { label: "Товары на исходе", count: low.length, href: "/supplier/stock?status=low", urgent: false },
    { label: "Просрочен счёт на комиссию", count: overdueInvoices, href: "/supplier/commission", urgent: true },
  ];
  return items.filter((i) => i.count > 0);
}

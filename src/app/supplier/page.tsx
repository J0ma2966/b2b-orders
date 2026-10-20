import Link from "next/link";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/auth/current";
import { SUPPLIER_ROLE_LABEL, SUPPLIER_STATUS_COLOR, SUPPLIER_STATUS_LABEL, supplierTransition } from "@/lib/statuses";
import { resubmitSupplierAction } from "./actions";

export default async function SupplierHome() {
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const s = ctx.supplier;
  const [members, territories] = await Promise.all([
    db.supplierMember.groupBy({ by: ["role"], where: { supplierId: s.id, isActive: true }, _count: true }),
    db.supplierTerritory.count({ where: { supplierId: s.id } }),
  ]);
  const count = Object.fromEntries(members.map((m) => [m.role, m._count]));
  const canResubmit = supplierTransition("resubmit", s.status) !== null;
  return (
    <>
      <PageHeader
        title={s.displayName}
        subtitle={
          <span className="flex items-center gap-2">
            <Badge color={SUPPLIER_STATUS_COLOR[s.status]}>{SUPPLIER_STATUS_LABEL[s.status]}</Badge>
            <span>Вы: {SUPPLIER_ROLE_LABEL[ctx.membership.role]}</span>
          </span>
        }
      />
      <div className="space-y-4">
        {s.status === "PENDING" && (
          <Alert tone="warning">Заявка на проверке у администратора платформы. Мы пришлём уведомление, когда её рассмотрят. Пока можно заполнить профиль и добавить сотрудников.</Alert>
        )}
        {s.status === "NEEDS_INFO" && (
          <Alert tone="warning">
            <p className="font-medium">Администратор просит дополнить сведения:</p>
            <p className="mt-1">{s.moderationComment}</p>
            <p className="mt-2">Исправьте <Link className="underline" href="/supplier/profile">профиль</Link> и отправьте заявку снова.</p>
          </Alert>
        )}
        {s.status === "REJECTED" && (
          <Alert tone="error">
            <p className="font-medium">Заявка отклонена.</p>
            {s.moderationComment && <p className="mt-1">Причина: {s.moderationComment}</p>}
          </Alert>
        )}
        {s.status === "BLOCKED" && (
          <Alert tone="error">
            Компания заблокирована. {s.moderationComment && `Причина: ${s.moderationComment}. `}Обратитесь к администратору платформы.
          </Alert>
        )}
        {canResubmit && (
          <form action={resubmitSupplierAction}>
            <SubmitButton>Отправить заявку на проверку</SubmitButton>
          </form>
        )}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <Link href="/supplier/team"><Card><div className="text-2xl font-semibold">{count.ADMIN ?? 0}</div><div className="text-sm text-gray-500">Администраторы</div></Card></Link>
          <Link href="/supplier/team"><Card><div className="text-2xl font-semibold">{count.COURIER ?? 0}</div><div className="text-sm text-gray-500">Доставщики</div></Card></Link>
          <Link href="/supplier/territory"><Card><div className="text-2xl font-semibold">{territories}</div><div className="text-sm text-gray-500">Территорий доставки</div></Card></Link>
        </div>
        <Alert>Каталог, остатки и заказы появятся на следующих этапах разработки.</Alert>
      </div>
    </>
  );
}

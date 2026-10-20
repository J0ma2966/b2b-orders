import { Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/current";
import { formatDateTime } from "@/lib/format";
import { markAllReadAction, openNotificationAction } from "./actions";

export default async function NotificationsPage() {
  const auth = await requireAuth();
  const items = await db.notification.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.some((n) => !n.readAt);
  return (
    <>
      <PageHeader
        title="Уведомления"
        actions={
          unread && (
            <form action={markAllReadAction}>
              <SubmitButton variant="secondary">Прочитать все</SubmitButton>
            </form>
          )
        }
      />
      {items.length === 0 ? (
        <EmptyState>Уведомлений пока нет</EmptyState>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-gray-100">
            {items.map((n) => (
              <li key={n.id}>
                <form action={openNotificationAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <button className={`block w-full px-4 py-3 text-left hover:bg-gray-50 ${n.readAt ? "" : "bg-brand-50/60"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <span className={n.readAt ? "text-sm" : "text-sm font-semibold"}>{n.title}</span>
                      <span className="shrink-0 text-xs text-gray-400">{formatDateTime(n.createdAt)}</span>
                    </div>
                    {n.body && <div className="mt-0.5 text-sm text-gray-600">{n.body}</div>}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

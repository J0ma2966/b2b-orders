import Link from "next/link";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { SubmitButton } from "@/components/ui/submit-button";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";
import { senderLabel, snippet, supportMailConfig } from "@/lib/support-mail-core";
import { supportMailMode, supportMailState } from "@/lib/support-mail";
import type { Prisma } from "@/generated/prisma/client";
import { checkSupportMailAction } from "./actions";

const FILTERS: [string, string][] = [
  ["new", "Новые"],
  ["handled", "Обработанные"],
];

// Письма из ящика техподдержки (src/lib/support-mail.ts)
export default async function SupportPage({ searchParams }: PageProps<"/admin/support">) {
  const t = await getT();
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" && sp.status ? sp.status : undefined;
  const page = pageFrom(sp);
  const where: Prisma.SupportEmailWhereInput = {
    ...(status === "new" && { handledAt: null }),
    ...(status === "handled" && { handledAt: { not: null } }),
    ...(q && {
      OR: [
        { subject: { contains: q, mode: "insensitive" } },
        { fromAddress: { contains: q, mode: "insensitive" } },
        { fromName: { contains: q, mode: "insensitive" } },
        { text: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
  const cfg = supportMailConfig();
  const mode = supportMailMode();
  const [total, rows, fresh, state] = await Promise.all([
    db.supportEmail.count({ where }),
    db.supportEmail.findMany({ where, orderBy: { receivedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.supportEmail.count({ where: { handledAt: null } }),
    supportMailState(),
  ]);
  return (
    <>
      <PageHeader
        title="Поддержка"
        subtitle={cfg ? t("Письма из ящика {box} · новых: {n}", { box: cfg.user, n: fresh }) : t("Письма из ящика техподдержки · новых: {n}", { n: fresh })}
        actions={
          cfg && (
            <form action={checkSupportMailAction}>
              <SubmitButton variant="secondary" pendingText="Проверка…">{t("Проверить почту")}</SubmitButton>
            </form>
          )
        }
      />
      <div className="mb-4 space-y-2">
        {!mode && (
          <Alert tone="warning">
            {t("Почта поддержки не подключена. На сервере выполните sudo b2b-support-mail setup (IMAP) или sudo b2b-support-mail gmail-script (скрипт Gmail).")}
          </Alert>
        )}
        {cfg && state.lastError && <Alert tone="error">{t(state.lastError)}</Alert>}
        {cfg && (
          <p className="text-xs text-gray-500">
            {state.lastOkAt ? t("Почта проверена {date}", { date: t.dateTime(state.lastOkAt) }) : t("Почта ещё не проверялась. Первая проверка — через минуту после запуска сервера.")}
          </p>
        )}
        {mode === "webhook" && (
          <p className="text-xs text-gray-500">
            {state.lastOkAt ? t("Письма пересылает скрипт Gmail, последний раз {date}", { date: t.dateTime(state.lastOkAt) }) : t("Ждём первую пересылку от скрипта Gmail (раз в минуту).")}
          </p>
        )}
      </div>
      <FilterBar q={q} status={status} statuses={FILTERS} allLabel="Все письма" placeholder="Тема, отправитель или текст" />
      {rows.length === 0 ? (
        <EmptyState>{t("Писем нет")}</EmptyState>
      ) : (
        <Card className="divide-y divide-gray-100 p-0 sm:p-0">
          {rows.map((r) => (
            <Link key={r.id} href={`/admin/support/${r.id}`} className="block px-4 py-3 hover:bg-gray-50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={r.handledAt ? "text-sm text-gray-600" : "text-sm font-semibold"}>{senderLabel(r)}</span>
                <span className="text-xs whitespace-nowrap text-gray-500">{t.dateTime(r.receivedAt)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                {!r.handledAt && <Badge color="blue">{t("Новое")}</Badge>}
                <span className={r.handledAt ? "text-sm" : "text-sm font-medium"}>{r.subject}</span>
              </div>
              <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">{snippet(r.text, 220)}</div>
            </Link>
          ))}
        </Card>
      )}
      <Pagination page={page} total={total} basePath="/admin/support" params={{ q, status }} />
    </>
  );
}

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
import { SUPPORT_TOPICS, isSupportTopic, supportTopicLabel } from "@/lib/support-topics";
import { checkSupportMailAction, markAllSupportEmailsHandledAction } from "./actions";
import { supportFilter, supportWhere } from "./filter";

const FILTERS: [string, string][] = [
  ["new", "Новые"],
  ["handled", "Обработанные"],
  ["spam", "Спам Gmail"],
];

// Письма из ящика техподдержки (src/lib/support-mail.ts)
export default async function SupportPage({ searchParams }: PageProps<"/admin/support">) {
  const t = await getT();
  await requireSuperAdmin();
  const sp = await searchParams;
  const filter = supportFilter((k) => sp[k]);
  const { q, status, topic } = filter;
  const page = pageFrom(sp);
  const where = supportWhere(filter);
  const cfg = supportMailConfig();
  const mode = supportMailMode();
  const [total, rows, fresh, state, freshHere, byTopic, spamFresh] = await Promise.all([
    db.supportEmail.count({ where }),
    db.supportEmail.findMany({ where, orderBy: { receivedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.supportEmail.count({ where: { handledAt: null, spam: false } }),
    supportMailState(),
    db.supportEmail.count({ where: { AND: [where, { handledAt: null }] } }),
    db.supportEmail.groupBy({ by: ["topic"], where: { handledAt: null, spam: false }, _count: true }),
    db.supportEmail.count({ where: { handledAt: null, spam: true } }),
  ]);
  const freshByTopic = new Map(byTopic.map((x) => [x.topic ?? "none", x._count]));
  // Ссылка на тему с сохранением поиска и статуса
  const topicHref = (code?: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (code) p.set("topic", code);
    const s = p.toString();
    return s ? `/admin/support?${s}` : "/admin/support";
  };
  const chip = (code: string | undefined, label: string) => {
    const n = code ? freshByTopic.get(code) : fresh;
    return (
      <Link
        key={code ?? "all"}
        href={topicHref(code)}
        className={`inline-flex min-h-9 items-center gap-1 rounded-full px-3 py-1 text-sm ring-1 ${topic === code ? "bg-brand-600 text-on-brand ring-brand-600" : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50"}`}
      >
        {t(label)}
        {!!n && <span className={topic === code ? "text-xs" : "text-xs text-gray-500"}>{n}</span>}
      </Link>
    );
  };
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
        {spamFresh > 0 && status !== "spam" && (
          <Alert tone="warning">
            {t("В спаме Gmail необработанных писем: {n}.", { n: spamFresh })}{" "}
            <Link href="/admin/support?status=spam" className="underline">{t("Проверить")}</Link>
          </Alert>
        )}
        {mode === "webhook" && (
          <p className="text-xs text-gray-500">
            {state.lastOkAt ? t("Письма пересылает скрипт Gmail, последний раз {date}", { date: t.dateTime(state.lastOkAt) }) : t("Ждём первую пересылку от скрипта Gmail (раз в минуту).")}
          </p>
        )}
      </div>
      <div className="mb-3 flex flex-wrap gap-2" aria-label={t("Тема обращения")}>
        {chip(undefined, "Все темы")}
        {SUPPORT_TOPICS.map((x) => chip(x.code, x.ru))}
        {chip("none", "Без темы")}
      </div>
      <FilterBar q={q} status={status} statuses={FILTERS} allLabel="Все письма" placeholder="Тема, отправитель или текст" hidden={{ topic }} />
      {freshHere > 0 && (
        <form action={markAllSupportEmailsHandledAction} className="mb-4 flex flex-wrap items-center gap-3">
          {q && <input type="hidden" name="q" value={q} />}
          {status && <input type="hidden" name="status" value={status} />}
          {topic && <input type="hidden" name="topic" value={topic} />}
          <SubmitButton variant="secondary" pendingText="Сохранение…" confirm="Отметить все новые письма в этом списке обработанными?">
            {t("Отметить все обработанными ({n})", { n: freshHere })}
          </SubmitButton>
          {(q || topic) && <span className="text-xs text-gray-500">{t("Только письма, которые подходят под поиск и тему")}</span>}
        </form>
      )}
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
                {r.spam && <Badge color="yellow">{t("Спам Gmail")}</Badge>}
                {!r.handledAt && !r.spam && <Badge color="blue">{t("Новое")}</Badge>}
                {isSupportTopic(r.topic) && <Badge color="gray">{t(supportTopicLabel(r.topic))}</Badge>}
                <span className={r.handledAt ? "text-sm" : "text-sm font-medium"}>{r.subject}</span>
              </div>
              <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">{snippet(r.text, 220)}</div>
            </Link>
          ))}
        </Card>
      )}
      <Pagination page={page} total={total} basePath="/admin/support" params={{ q, status, topic }} />
    </>
  );
}

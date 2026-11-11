import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, DefinitionList, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";
import { replyMailto, senderLabel } from "@/lib/support-mail-core";
import { setSupportEmailHandledAction } from "../actions";

type Attachment = { name: string; size: number; type: string };

const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// Одно письмо в поддержку. Текст показывается как текст: HTML письма не выполняется.
export default async function SupportEmailPage({ params }: PageProps<"/admin/support/[id]">) {
  const t = await getT();
  await requireSuperAdmin();
  const { id } = await params;
  const mail = await db.supportEmail.findUnique({ where: { id } });
  if (!mail) notFound();
  const handledBy = mail.handledById ? await db.user.findUnique({ where: { id: mail.handledById }, select: { fullName: true } }) : null;
  const reply = replyMailto(mail);
  const attachments = (mail.attachments as Attachment[] | null) ?? [];
  return (
    <>
      <PageHeader
        title={mail.subject}
        subtitle={mail.handledAt ? <Badge color="green">{t("Обработано")}</Badge> : <Badge color="blue">{t("Новое")}</Badge>}
        actions={<Link href="/admin/support" className="text-sm text-brand-600">{t("← Все письма")}</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="text-sm break-words whitespace-pre-wrap">{mail.text}</div>
          {attachments.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3 text-sm">
              <div className="mb-1 font-medium">{t("Вложения")}</div>
              <ul className="space-y-0.5 text-gray-600">
                {attachments.map((a, i) => (
                  <li key={i}>📎 {a.name} <span className="text-xs text-gray-400">{size(a.size)}</span></li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-gray-500">{t("Вложения откройте в почтовом ящике.")}</p>
            </div>
          )}
        </Card>
        <Card className="space-y-4 lg:col-span-2">
          <DefinitionList
            items={[
              ["От кого", senderLabel(mail)],
              ["Ответ на адрес", mail.replyTo && mail.replyTo !== mail.fromAddress ? mail.replyTo : null],
              ["Получено", t.dateTime(mail.receivedAt)],
              ["Обработано", mail.handledAt ? `${t.dateTime(mail.handledAt)}${handledBy ? `, ${t.person(handledBy.fullName)}` : ""}` : null],
            ].filter((row): row is [string, string] => !!row[1])}
          />
          <div className="flex flex-wrap gap-2">
            {reply && (
              <a href={reply} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-on-brand hover:bg-brand-700">
                {t("Ответить письмом")}
              </a>
            )}
            <form action={setSupportEmailHandledAction}>
              <input type="hidden" name="id" value={mail.id} />
              <input type="hidden" name="handled" value={mail.handledAt ? "0" : "1"} />
              <SubmitButton variant="secondary">{mail.handledAt ? t("Вернуть в новые") : t("Отметить обработанным")}</SubmitButton>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}

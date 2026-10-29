import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireAuth } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";
import { deletionImpact } from "@/lib/account-deletion";
import { DeleteAccountForm } from "./delete-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Удаление аккаунта") };
}

export default async function DeleteAccountPage() {
  const [auth, t] = await Promise.all([requireAuth({ allowTempPassword: true }), getT()]);
  if (auth.isImpersonating || auth.realUser.isSuperAdmin) {
    return (
      <Card>
        <p>{t("Аккаунт супер-администратора удаляется только через сервер")}</p>
      </Card>
    );
  }
  const impact = await deletionImpact(auth.realUser.id);
  return (
    <>
      <PageHeader title="Удаление аккаунта" />
      <Card className="max-w-2xl space-y-4 text-sm">
        <div className="space-y-2">
          <p className="font-semibold">{t("Что будет удалено сразу")}</p>
          <ul className="list-disc space-y-1 pl-5 text-gray-700">
            <li>{t("ваше имя, телефон, e-mail и пароль")}</li>
            <li>{t("вход на всех устройствах и push-уведомления")}</li>
            <li>{t("ваши уведомления и доступ к магазинам и поставщикам")}</li>
          </ul>
          <p className="font-semibold">{t("Что останется")}</p>
          <p className="text-gray-700">
            {t("Заказы, оплаты, долги, чеки и накладные — учётные документы магазина и поставщика. Они сохраняются без вашего имени и телефона: в них будет указано «Удалённый пользователь».")}
          </p>
        </div>
        {impact.lastInSuppliers.length > 0 && (
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">
            {t("Вы последний управляющий поставщика {names}. После удаления он будет скрыт от магазинов и перестанет принимать заказы. Чтобы этого не было, сначала добавьте другого администратора в разделе «Сотрудники».", { names: impact.lastInSuppliers.map((s) => s.name).join(", ") })}
          </p>
        )}
        {impact.lastInShops.length > 0 && (
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">
            {t("Вы единственный владелец магазина {names}. После удаления никто не сможет заказывать от его имени.", { names: impact.lastInShops.map((s) => s.name).join(", ") })}
          </p>
        )}
        <DeleteAccountForm />
        <p>
          <Link href="/account" className="text-brand-600 hover:underline">{t("← Назад")}</Link>
        </p>
      </Card>
    </>
  );
}

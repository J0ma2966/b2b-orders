import Link from "next/link";
import { Button, Card, DefinitionList, PageHeader } from "@/components/ui";
import { logoutAction } from "@/app/(auth)/actions";
import { requireAuth } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";
import { formatPhone } from "@/lib/phone";
import { PasswordForm } from "./password-form";
import { PushSettings } from "./push-settings";
import { db } from "@/lib/db";
import { vapidPublicKey } from "@/lib/push";
import { nativePushConfigured } from "@/lib/native-push";

export default async function AccountPage() {
  const [auth, t] = await Promise.all([requireAuth(), getT()]);
  const [web, apps] = await Promise.all([
    db.pushSubscription.count({ where: { userId: auth.realUser.id } }),
    db.deviceToken.count({ where: { userId: auth.realUser.id } }),
  ]);
  const devices = web + apps;
  return (
    <>
      <PageHeader title="Мой профиль" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <DefinitionList
            items={[
              ["ФИО", auth.user.fullName],
              ["Телефон", formatPhone(auth.user.phone)],
              ["Зарегистрирован", t.dateTime(auth.user.createdAt)],
            ]}
          />
        </Card>
        {!auth.isImpersonating && (
          <Card>
            <h2 className="mb-3 font-semibold">{t("Уведомления")}</h2>
            <PushSettings enabled={auth.realUser.pushEnabled} devices={devices} publicKey={vapidPublicKey()} native={nativePushConfigured} />
          </Card>
        )}
        {!auth.isImpersonating && (
          <Card>
            <h2 className="mb-3 font-semibold">{t("Сменить пароль")}</h2>

            <PasswordForm />
          </Card>
        )}
        <Card>
          <h2 className="mb-2 font-semibold">{t("Конфиденциальность")}</h2>
          <div className="space-y-2 text-sm">
            <p><Link href="/privacy" className="text-brand-600 hover:underline">{t("Политика конфиденциальности")}</Link></p>
            {!auth.isImpersonating && !auth.realUser.isSuperAdmin && (
              <p><Link href="/account/delete" className="text-red-600 hover:underline">{t("Удалить аккаунт")}</Link></p>
            )}
          </div>
        </Card>
      </div>
      {/* В мобильном приложении шапка узкая — выход всегда есть здесь, в профиле любой роли */}
      <form action={logoutAction} className="mt-4">
        <Button variant="secondary" className="w-full text-red-600 sm:w-auto">⏻ Выйти из аккаунта</Button>
      </form>
    </>
  );
}

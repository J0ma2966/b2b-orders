import { Card, DefinitionList, PageHeader } from "@/components/ui";
import { requireAuth } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";
import { formatPhone } from "@/lib/phone";
import { PasswordForm } from "./password-form";
import { PushSettings } from "./push-settings";
import { db } from "@/lib/db";
import { vapidPublicKey } from "@/lib/push";

export default async function AccountPage() {
  const [auth, t] = await Promise.all([requireAuth(), getT()]);
  const devices = await db.pushSubscription.count({ where: { userId: auth.realUser.id } });
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
            <PushSettings enabled={auth.realUser.pushEnabled} devices={devices} publicKey={vapidPublicKey()} />
          </Card>
        )}
        {!auth.isImpersonating && (
          <Card>
            <h2 className="mb-3 font-semibold">{t("Сменить пароль")}</h2>

            <PasswordForm />
          </Card>
        )}
      </div>
    </>
  );
}

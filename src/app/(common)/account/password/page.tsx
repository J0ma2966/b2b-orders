import { Alert, Card, PageHeader } from "@/components/ui";
import { requireAuth } from "@/lib/auth/current";
import { PasswordForm } from "../password-form";
import { getT } from "@/lib/i18n/server";
import { canResetWithoutCurrent } from "@/lib/auth/session";

// Обязательная смена временного пароля после первого входа
export default async function ForcePasswordPage() {
  const t = await getT();
  const auth = await requireAuth({ allowTempPassword: true });
  const reset = !auth.isImpersonating && canResetWithoutCurrent(auth.session);
  return (
    <>
      <PageHeader title="Задайте свой пароль" />
      <Card className="max-w-md space-y-4">
        {auth.realUser.mustChangePassword && !reset && <Alert tone="warning">{t("Вы вошли по временному паролю. Придумайте новый, чтобы продолжить.")}</Alert>}
        {reset && <Alert tone="info">{t("Вы вошли по коду. Придумайте новый пароль — старый вводить не нужно.")}</Alert>}
        <PasswordForm needCurrent={!reset} />
      </Card>
    </>
  );
}

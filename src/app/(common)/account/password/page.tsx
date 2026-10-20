import { Alert, Card, PageHeader } from "@/components/ui";
import { requireAuth } from "@/lib/auth/current";
import { PasswordForm } from "../password-form";
import { getT } from "@/lib/i18n/server";

// Обязательная смена временного пароля после первого входа
export default async function ForcePasswordPage() {
  const t = await getT();
  const auth = await requireAuth({ allowTempPassword: true });
  return (
    <>
      <PageHeader title="Задайте свой пароль" />
      <Card className="max-w-md space-y-4">
        {auth.realUser.mustChangePassword && <Alert tone="warning">{t("Вы вошли по временному паролю. Придумайте новый, чтобы продолжить.")}</Alert>}
        <PasswordForm />
      </Card>
    </>
  );
}

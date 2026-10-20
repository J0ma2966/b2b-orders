import { Card, DefinitionList, PageHeader } from "@/components/ui";
import { requireAuth } from "@/lib/auth/current";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const auth = await requireAuth();
  return (
    <>
      <PageHeader title="Мой профиль" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <DefinitionList
            items={[
              ["ФИО", auth.user.fullName],
              ["Телефон", formatPhone(auth.user.phone)],
              ["Зарегистрирован", formatDateTime(auth.user.createdAt)],
            ]}
          />
        </Card>
        {!auth.isImpersonating && (
          <Card>
            <h2 className="mb-3 font-semibold">Сменить пароль</h2>
            <PasswordForm />
          </Card>
        )}
      </div>
    </>
  );
}

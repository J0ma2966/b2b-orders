import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Spinner } from "@/components/ui";
import { getAuth } from "@/lib/auth/current";
import { getTerritoryOptions } from "@/lib/territory";
import { getT } from "@/lib/i18n/server";
import { SupplierRegisterForm } from "./supplier-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Заявка поставщика") };
}

export default async function RegisterSupplierPage() {
  const t = await getT();
  return (
    <Card>
      <h1 className="text-xl font-semibold">{t("Заявка поставщика")}</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        {t("После отправки заявка получит статус «На проверке». Когда администратор платформы её подтвердит, вы сможете вести каталог и принимать заказы.")}
      </p>

      <Suspense fallback={<Spinner />}>
        <FormLoader />
      </Suspense>
    </Card>
  );
}

async function FormLoader() {
  const [auth, territories] = await Promise.all([getAuth(), getTerritoryOptions()]);
  return <SupplierRegisterForm territories={territories} loggedIn={!!auth} />;
}

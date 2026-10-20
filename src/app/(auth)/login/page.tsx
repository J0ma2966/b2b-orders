import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Вход") };
}

export default async function LoginPage() {
  const t = await getT();
  return (
    <Card className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-semibold">{t("Вход")}</h1>
      <LoginForm />
      <div className="mt-6 space-y-1 text-sm text-gray-600">
        <p>
          {t("Нет аккаунта?")} <Link className="text-brand-600 hover:underline" href="/register/shop">{t("Регистрация магазина")}</Link>
        </p>
        <p>
          {t("Вы поставщик?")} <Link className="text-brand-600 hover:underline" href="/register/supplier">{t("Подать заявку")}</Link>
        </p>
      </div>
    </Card>
  );
}

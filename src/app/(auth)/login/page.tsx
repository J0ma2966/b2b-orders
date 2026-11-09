import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { LoginForm } from "./login-form";
import { codeChannels } from "@/lib/login-code";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Вход") };
}

export default async function LoginPage() {
  const t = await getT();
  const channels = codeChannels();
  const byCode = !!(channels.telegram || channels.sms);
  return (
    <Card className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-semibold">{t("Вход")}</h1>
      <LoginForm />
      {byCode && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <Link className="font-medium text-brand-600 hover:underline" href="/login/code">
            {t(channels.telegram ? "Войти по коду из Telegram" : "Войти по коду из SMS")}
          </Link>
          <Link className="text-gray-500 hover:underline" href="/login/code?reset=1">{t("Забыли пароль?")}</Link>
        </div>
      )}
      <div className="mt-6 space-y-1 text-sm text-gray-600">
        <p>
          {t("Нет аккаунта?")} <Link className="text-brand-600 hover:underline" href="/register/shop">{t("Регистрация магазина")}</Link>
        </p>
        <p>
          {t("Вы поставщик?")} <Link className="text-brand-600 hover:underline" href="/register/supplier">{t("Подать заявку")}</Link>
        </p>
        <p className="pt-3 text-xs">
          <Link className="text-gray-500 hover:underline" href="/privacy">{t("Политика конфиденциальности")}</Link>
        </p>
      </div>
    </Card>
  );
}

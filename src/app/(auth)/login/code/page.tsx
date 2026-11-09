import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { codeChannels } from "@/lib/login-code";
import { CodeLoginForm } from "./code-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Вход по коду") };
}

// Вход по одноразовому коду из Telegram или SMS; он же — восстановление пароля (?reset=1)
export default async function CodeLoginPage({ searchParams }: PageProps<"/login/code">) {
  const [t, sp] = await Promise.all([getT(), searchParams]);
  const channels = codeChannels();
  if (!channels.telegram && !channels.sms) notFound();
  const reset = sp.reset === "1";
  return (
    <Card className="mx-auto max-w-sm">
      <h1 className="mb-1 text-xl font-semibold">{t(reset ? "Восстановление пароля" : "Вход по коду")}</h1>
      <p className="mb-4 text-sm text-gray-600">
        {t(reset ? "Войдите по одноразовому коду и задайте новый пароль." : "Пришлём одноразовый код — пароль не нужен.")}
      </p>
      <CodeLoginForm telegram={channels.telegram} sms={channels.sms} reset={reset} />
      <p className="mt-6 text-sm">
        <Link className="text-brand-600 hover:underline" href="/login">{t("Войти по паролю")}</Link>
      </p>
    </Card>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход" };

export default function LoginPage() {
  return (
    <Card className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-semibold">Вход</h1>
      <LoginForm />
      <div className="mt-6 space-y-1 text-sm text-gray-600">
        <p>
          Нет аккаунта? <Link className="text-brand-600 hover:underline" href="/register/shop">Регистрация магазина</Link>
        </p>
        <p>
          Вы поставщик? <Link className="text-brand-600 hover:underline" href="/register/supplier">Подать заявку</Link>
        </p>
      </div>
    </Card>
  );
}

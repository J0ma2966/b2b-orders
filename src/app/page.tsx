import { Suspense } from "react";
import { ButtonLink, Card } from "@/components/ui";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { getAuth, homePathFor } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";

export default async function Home() {
  const t = await getT();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-12">
      <LanguageSwitcher className="mb-6 self-start" />
      <p className="text-lg font-semibold text-brand-700">OptoLink</p>
      <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{t("Оптовые заказы у поставщиков")}</h1>
      <p className="mt-3 text-gray-600">
        {t("Магазины заказывают товар у поставщиков своего региона, поставщики ведут каталог, остатки и доставку, а платформа учитывает приёмку, оплаты и долги.")}
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-semibold">{t("Магазинам")}</h2>
          <p className="mt-1 text-sm text-gray-500">{t("Каталоги поставщиков, корзина, заказы и задолженность в телефоне.")}</p>
          <ButtonLink href="/register/shop" className="mt-4 w-full">{t("Зарегистрировать магазин")}</ButtonLink>
        </Card>
        <Card>
          <h2 className="font-semibold">{t("Поставщикам")}</h2>
          <p className="mt-1 text-sm text-gray-500">{t("Каталог, цены, остатки, заказы, доставщики и отчёты.")}</p>
          <ButtonLink href="/register/supplier" variant="secondary" className="mt-4 w-full">{t("Подать заявку")}</ButtonLink>
        </Card>
      </div>
      <div className="mt-6">
        <Suspense fallback={<ButtonLink href="/login" variant="ghost">{t("Войти")}</ButtonLink>}>
          <EnterLink />
        </Suspense>
      </div>
    </main>
  );
}

async function EnterLink() {
  const t = await getT();
  const auth = await getAuth();
  if (!auth) return <ButtonLink href="/login" variant="ghost">{t("Уже зарегистрированы? Войти")}</ButtonLink>;
  return <ButtonLink href={await homePathFor(auth)}>{t("Перейти в кабинет")}</ButtonLink>;
}

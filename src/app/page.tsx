import { Suspense } from "react";
import { ButtonLink, Card } from "@/components/ui";
import { getAuth, homePathFor } from "@/lib/auth/current";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-12">
      <h1 className="text-3xl font-semibold sm:text-4xl">Оптовые заказы у поставщиков</h1>
      <p className="mt-3 text-gray-600">
        Магазины заказывают товар у поставщиков своего региона, поставщики ведут каталог, остатки и доставку, а платформа учитывает приёмку, оплаты и долги.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Магазинам</h2>
          <p className="mt-1 text-sm text-gray-500">Каталоги поставщиков, корзина, заказы и задолженность в телефоне.</p>
          <ButtonLink href="/register/shop" className="mt-4 w-full">Зарегистрировать магазин</ButtonLink>
        </Card>
        <Card>
          <h2 className="font-semibold">Поставщикам</h2>
          <p className="mt-1 text-sm text-gray-500">Каталог, цены, остатки, заказы, доставщики и отчёты.</p>
          <ButtonLink href="/register/supplier" variant="secondary" className="mt-4 w-full">Подать заявку</ButtonLink>
        </Card>
      </div>
      <div className="mt-6">
        <Suspense fallback={<ButtonLink href="/login" variant="ghost">Войти</ButtonLink>}>
          <EnterLink />
        </Suspense>
      </div>
    </main>
  );
}

async function EnterLink() {
  const auth = await getAuth();
  if (!auth) return <ButtonLink href="/login" variant="ghost">Уже зарегистрированы? Войти</ButtonLink>;
  return <ButtonLink href={await homePathFor(auth)}>Перейти в кабинет</ButtonLink>;
}

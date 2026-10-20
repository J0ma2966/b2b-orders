import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Spinner } from "@/components/ui";
import { getAuth } from "@/lib/auth/current";
import { getTerritoryOptions } from "@/lib/territory";
import { ShopRegisterForm } from "./shop-form";

export const metadata: Metadata = { title: "Регистрация магазина" };

export default function RegisterShopPage() {
  return (
    <Card>
      <h1 className="text-xl font-semibold">Регистрация магазина</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Каждая торговая точка регистрируется отдельно. Вторую точку можно добавить после входа.
      </p>
      <Suspense fallback={<Spinner />}>
        <FormLoader />
      </Suspense>
    </Card>
  );
}

async function FormLoader() {
  const [auth, territories] = await Promise.all([getAuth(), getTerritoryOptions()]);
  return <ShopRegisterForm territories={territories} loggedIn={!!auth} />;
}

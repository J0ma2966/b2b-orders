import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import "@fontsource-variable/onest";
import "@fontsource-variable/unbounded";
import "@fontsource-variable/commissioner";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";
import { NativeBridge } from "@/components/native/native-bridge";
import { NativePushSync } from "@/components/native/native-push-sync";
import { getAuth } from "@/lib/auth/current";
import { nativePushConfigured } from "@/lib/native-push";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const name = t("Оптовые заказы");
  return {
    title: { default: name, template: `%s · ${name}` },
    description: t("B2B-платформа заказов между поставщиками и магазинами"),
    applicationName: name,
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: "#1f5ad6",
  width: "device-width",
  initialScale: 1,
};

// Язык читается из cookie, поэтому всё содержимое страницы рендерится по запросу
async function LocaleRoot({ children }: { children: ReactNode }) {
  return <I18nProvider locale={await getLocale()}>{children}</I18nProvider>;
}

// Мобильное приложение: обновить токен push для вошедшего пользователя
async function NativeSession() {
  const auth = await getAuth();
  if (!auth || auth.isImpersonating || !auth.realUser.pushEnabled) return null;
  return <NativePushSync config={nativePushConfigured} />;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <Suspense>
          <LocaleRoot>{children}</LocaleRoot>
        </Suspense>
        <SwRegister />
        <NativeBridge />
        <Suspense>
          <NativeSession />
        </Suspense>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  title: { default: "Оптовые заказы", template: "%s · Оптовые заказы" },
  description: "B2B-платформа заказов между поставщиками и магазинами",
  applicationName: "Оптовые заказы",
  appleWebApp: { capable: true, title: "Оптовые заказы", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1f5ad6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}

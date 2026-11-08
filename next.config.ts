import type { NextConfig } from "next";

// Заголовки безопасности для всех ответов: страницу нельзя встроить в чужой сайт (кликджекинг),
// браузер не угадывает тип файлов, адрес страницы не уходит на чужие сайты целиком,
// камера и геолокация — только для самого сайта (QR, фото, точка на карте).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
];

// Только для `npm run dev`: телефон в той же Wi‑Fi сети открывает сайт по адресу компьютера
// (http://192.168.x.x:3000). Без этого списка Next.js не отдаёт ему служебные файлы /_next/*,
// страница на телефоне остаётся без JavaScript, и формы не работают. На продакшен не влияет.
// Свой адрес можно добавить через DEV_ORIGINS="мой-ноутбук.local,другой.хост".
const lanDevOrigins = [
  "192.168.*.*",
  "10.*.*.*",
  ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
  ...(process.env.DEV_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: lanDevOrigins,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Проверка «мгновенных переходов» в режиме разработки: только для страниц, где явно указано
    // `export const instant = true`. Каждая страница кабинета читает сессию и свежие данные из БД
    // (заказы, остатки, долги) — кэшировать их нельзя, поэтому переход ждёт сервер, а пока
    // показывается каркас кабинета. Без этой настройки Next.js 16.4 сыпет в консоль ошибками
    // «uncached data during prerendering or a navigation» на каждой странице. На сборку не влияет.
    instantInsights: { validationLevel: "manual-warning" },
    serverActions: {
      // Самая тяжёлая форма — заявка на замену: 4 фото по 10 МБ и видео до 50 МБ
      bodySizeLimit: "95mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

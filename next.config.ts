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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
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

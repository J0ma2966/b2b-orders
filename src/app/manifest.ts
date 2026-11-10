import type { MetadataRoute } from "next";

// PWA: магазин и доставщик ставят приложение на главный экран телефона.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OptoLink",
    short_name: "OptoLink",
    description: "Заказы у поставщиков, доставка и учёт оплат",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#5b3fd6",
    lang: "ru",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

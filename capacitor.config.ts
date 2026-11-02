import type { CapacitorConfig } from "@capacitor/cli";

// Мобильное приложение (Android, iOS) — нативная оболочка над сайтом платформы.
// Адрес сервера задаётся при сборке: MOBILE_SERVER_URL=https://заказы.uz npx cap sync
// Сервер — Next.js с Server Actions, поэтому страницы не выкладываются в приложение,
// а грузятся с сервера; в приложении лежит только страница «нет связи» (mobile/www).
const serverUrl = process.env.MOBILE_SERVER_URL ?? "https://app.example.uz";
const host = new URL(serverUrl).host;
const dev = serverUrl.startsWith("http://");

const config: CapacitorConfig = {
  appId: process.env.MOBILE_APP_ID ?? "uz.b2borders.app",
  appName: "Оптовые заказы",
  webDir: "mobile/www",
  // По этой метке сервер понимает, что страница открыта в приложении
  appendUserAgent: "B2BOrdersApp/1",
  backgroundColor: "#f5f6f8",
  loggingBehavior: "production",
  server: {
    url: serverUrl,
    // Только свой домен; остальные ссылки открываются в системном браузере
    allowNavigation: [host],
    errorPath: "offline.html",
    // Открытый HTTP — только для разработки на локальной сети
    cleartext: dev,
  },
  android: {
    path: "mobile/android",
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: dev,
  },
  ios: {
    path: "mobile/ios",
    scheme: "B2BOrders",
    // Содержимое не заходит под строку состояния и «чёлку»: сайт не использует viewport-fit=cover
    contentInset: "automatic",
    // Service worker (офлайн доставщика) в WKWebView работает только на доменах из WKAppBoundDomains
    limitsNavigationsToAppBoundDomains: true,
    webContentsDebuggingEnabled: dev,
  },
  plugins: {
    // Android 15+ рисует приложение от края до края; Capacitor сам отодвигает WebView от системных панелей,
    // пока на странице нет viewport-fit=cover
    SystemBars: { insetsHandling: "css" },
    SplashScreen: { launchShowDuration: 1500, launchAutoHide: true, backgroundColor: "#1f5ad6", showSpinner: false },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;

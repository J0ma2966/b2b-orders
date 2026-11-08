// Service worker: установка PWA, push-уведомления (ТЗ п. 57) и работа доставщика без сети (Д4)
const PAGES = "courier-pages-v1";
const STATIC = "static-v2";
const KEEP = [PAGES, STATIC];
// Без сети открываются список доставок и страницы заказов доставщика
const OFFLINE_PAGE = /^\/courier(\/orders\/[^/]+)?\/?$/;
const COURIER = /^\/courier(\/|$)/;
const ORDER_PAGE = /^\/courier\/orders\/[^/]+\/?$/;
const STATIC_FILE = /^\/_next\/static\//;
const MAX_STATIC = 400;
// Режим разработки (sw.js?dev=1): имена /_next/static/* не меняются при правке кода — не кэшируем их
const DEV = new URL(self.location.href).searchParams.has("dev");
const WARM_EVERY = 5 * 60_000;
const warmedAt = new Map();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (!KEEP.includes(k) || (DEV && k === STATIC)) await caches.delete(k);
      await self.clients.claim();
    })(),
  ),
);

const pageKey = (url) => {
  const u = new URL(url, self.location.origin);
  return u.origin + u.pathname.replace(/\/$/, "");
};
const sameOrigin = (url) => new URL(url, self.location.origin).origin === self.location.origin;

// Сохраняем только свою страницу доставщика, без переадресации (на вход, в другой кабинет)
function cacheable(res, url) {
  if (!res || !res.ok || res.redirected || res.type !== "basic") return false;
  return OFFLINE_PAGE.test(new URL(res.url || url).pathname) && (res.headers.get("content-type") || "").includes("text/html");
}

// Выход из кабинета: сохранённые страницы с адресами и телефонами магазинов удаляются
const forgetPages = () => caches.delete(PAGES).then(() => warmedAt.clear());

async function trimStatic(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_STATIC))) await cache.delete(k);
}

// Скрипты и стили сохранённой страницы — чтобы без сети она не только показывалась, но и работала
async function cacheAssets(html) {
  if (DEV) return;
  const cache = await caches.open(STATIC);
  const urls = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || []);
  for (const u of urls) {
    if (await cache.match(u)) continue;
    try {
      const res = await fetch(u);
      if (res.ok) await cache.put(u, res);
    } catch {}
  }
  await trimStatic(cache);
}

async function storePage(key, res) {
  const cache = await caches.open(PAGES);
  await cache.put(key, res.clone());
  warmedAt.set(key, Date.now());
  await cacheAssets(await res.text());
}

async function page(event) {
  const key = pageKey(event.request.url);
  try {
    const res = await fetch(event.request);
    if (cacheable(res, event.request.url)) event.waitUntil(storePage(key, res.clone()));
    else if (res.redirected && new URL(res.url).pathname === "/login") event.waitUntil(forgetPages());
    return res;
  } catch {
    const hit = await caches.match(key, { cacheName: PAGES, ignoreVary: true });
    return hit || offlinePage();
  }
}

async function staticFile(event) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok) event.waitUntil(cache.put(event.request, res.clone()));
  return res;
}

function offlinePage() {
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Нет сети</title>
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#111;color:#f5f5f5;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}a{color:#facc15}</style></head>
<body><main><h1>Нет сети</h1><p>Эта страница не сохранена на телефоне. Откройте список доставок — он доступен без сети.</p>
<p lang="uz">Tarmoq yoʻq. Bu sahifa telefonda saqlanmagan. Yetkazishlar roʻyxatini oching.</p><p><a href="/courier">Мои доставки · Yetkazishlarim</a></p></main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !sameOrigin(req.url)) return;
  const url = new URL(req.url);
  if (url.pathname === "/login") {
    event.waitUntil(forgetPages());
    return;
  }
  if (req.mode === "navigate" && COURIER.test(url.pathname)) return event.respondWith(page(event));
  if (!DEV && STATIC_FILE.test(url.pathname)) return event.respondWith(staticFile(event));
});

// Страница просит заранее сохранить список доставок и заказы из него
async function warm({ urls = [], force = false, prune = false }) {
  const keys = [...new Set(urls.filter((u) => typeof u === "string" && sameOrigin(u)).map(pageKey))].filter((k) => OFFLINE_PAGE.test(new URL(k).pathname)).slice(0, 60);
  for (const key of keys) {
    if (!force && Date.now() - (warmedAt.get(key) || 0) < WARM_EVERY) continue;
    warmedAt.set(key, Date.now());
    try {
      const res = await fetch(key, { credentials: "same-origin", headers: { Accept: "text/html" } });
      if (cacheable(res, key)) await storePage(key, res);
      else if (res.redirected && new URL(res.url).pathname === "/login") return forgetPages();
    } catch {}
  }
  if (prune) {
    const cache = await caches.open(PAGES);
    const wanted = new Set(keys);
    for (const req of await cache.keys()) if (ORDER_PAGE.test(new URL(req.url).pathname) && !wanted.has(pageKey(req.url))) await cache.delete(req);
  }
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "warm") event.waitUntil(warm(event.data));
  if (event.data && event.data.type === "forget") event.waitUntil(forgetPages());
});

self.addEventListener("push", (event) => {
  let data = { title: "Оптовые заказы", body: "", url: "/notifications" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: data.url } }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

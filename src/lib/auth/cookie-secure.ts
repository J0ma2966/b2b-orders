// Флаг Secure у cookie входа. По http браузер (и WebView приложения) не сохраняет Secure-cookie:
// вход как будто проходит, но на следующей странице снова просит войти. На http открывают только
// компьютер разработчика в своей сети (проверка с телефона по Wi‑Fi, docs/local-wifi.md),
// поэтому для локальных адресов флаг снимается сам; боевой домен всегда получает Secure.
// COOKIE_SECURE=0 / 1 — принудительно выключить / включить.

// Хост без порта: «192.168.1.10:3000» → «192.168.1.10», «[::1]:3000» → «::1»
function hostname(host: string) {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(1, h.indexOf("]"));
  const colon = h.lastIndexOf(":");
  return colon > -1 && h.indexOf(":") === colon ? h.slice(0, colon) : h;
}

export function isLocalNetworkHost(host: string | null | undefined) {
  if (!host) return false;
  const name = hostname(host);
  if (name === "localhost" || name.endsWith(".localhost") || name.endsWith(".local") || name === "::1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(name);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

export function sessionCookieSecure(env: { NODE_ENV?: string; COOKIE_SECURE?: string }, host: string | null | undefined) {
  if (env.COOKIE_SECURE === "0") return false;
  if (env.COOKIE_SECURE === "1") return true;
  if (env.NODE_ENV !== "production") return false;
  return !isLocalNetworkHost(host);
}

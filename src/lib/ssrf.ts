// Защита от SSRF для адресов, которые задаёт пользователь, а сервер потом сам вызывает
// (endpoint браузерной push-подписки — единственный такой адрес в платформе). Без проверки
// авторизованный пользователь мог бы заставить сервер стучаться во внутреннюю сеть
// (localhost, postgres, облачные метаданные 169.254.169.254 и т. п.).
//
// Здесь — чистые функции разбора адреса; резолвинг DNS и финальная проверка — в ssrf-resolve.ts
// (её нельзя звать на этапе сборки, поэтому держим отдельно от "server-only" модулей).

// IPv4 «a.b.c.d» → четыре октета, иначе null
function ipv4Octets(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const;
  if (o.some((n) => n > 255)) return null;
  return [o[0], o[1], o[2], o[3]];
}

// Закрытый IPv4: loopback, частные сети, link-local, CGNAT, 0.0.0.0/8, широковещательный и пр.
export function isBlockedIpv4(host: string): boolean {
  const o = ipv4Octets(host);
  if (!o) return false;
  const [a, b] = o;
  return (
    a === 0 || // 0.0.0.0/8 «этот хост»
    a === 10 || // 10.0.0.0/8
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local (в т. ч. метаданные облака)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 192 && b === 0) || // 192.0.0.0/24 и 192.0.2.0/24 служебные
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 бенчмарк
    a >= 224 // multicast и зарезервированные 224.0.0.0/4, 240.0.0.0/4, 255.255.255.255
  );
}

// Нормализуем IPv6: убираем зону («%eth0»), приводим к нижнему регистру
function normalizeIpv6(host: string): string {
  return host.replace(/%.*$/, "").toLowerCase();
}

// Закрытый IPv6: ::1 loopback, ::, fe80::/10 link-local, fc00::/7 unique-local,
// а также IPv4-mapped (::ffff:a.b.c.d) с закрытым IPv4 внутри
export function isBlockedIpv6(host: string): boolean {
  const h = normalizeIpv6(host);
  if (!h.includes(":")) return false;
  if (h === "::1" || h === "::") return true;
  // ::ffff:a.b.c.d и ::a.b.c.d — туннель к IPv4, проверяем вложенный IPv4
  const mapped = /(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(h);
  if (mapped) return isBlockedIpv4(mapped[1]);
  const first = h.split(":")[0];
  if (first.startsWith("fe8") || first.startsWith("fe9") || first.startsWith("fea") || first.startsWith("feb")) return true; // fe80::/10
  if (first.startsWith("fc") || first.startsWith("fd")) return true; // fc00::/7
  return false;
}

// Закрыт ли IP-литерал (IPv4 или IPv6) — хост, по которому нельзя ходить
export function isBlockedIp(host: string): boolean {
  return isBlockedIpv4(host) || isBlockedIpv6(host);
}

// Явно опасное имя хоста без резолвинга DNS: localhost, IP-литерал из закрытого диапазона.
// Публичное доменное имя тут проходит — его адрес проверяется уже после резолвинга (ssrf-resolve.ts).
export function isBlockedHostname(hostname: string): boolean {
  const name = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!name) return true;
  if (name === "localhost" || name.endsWith(".localhost") || name.endsWith(".local")) return true;
  return isBlockedIp(name);
}

export type ParsedEndpoint = { ok: true; hostname: string } | { ok: false };

// Адрес push-подписки должен быть https и вести на публичный хост
export function parsePushEndpoint(endpoint: string): ParsedEndpoint {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "https:") return { ok: false };
  if (isBlockedHostname(url.hostname)) return { ok: false };
  return { ok: true, hostname: url.hostname };
}

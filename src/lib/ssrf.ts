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

// IPv6 в любой записи («::1», «::ffff:127.0.0.1», «::ffff:7f00:1», «fe80::1%eth0») → 8 групп по 16 бит.
// null — это не IPv6-адрес.
export function ipv6Groups(host: string): number[] | null {
  let h = host.replace(/^\[|\]$/g, "").replace(/%.*$/, "").toLowerCase();
  if (!h.includes(":")) return null;
  // Хвост в виде IPv4 («::ffff:1.2.3.4») — это последние две группы
  const tail = /^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (tail) {
    const o = ipv4Octets(tail[2]);
    if (!o) return null;
    h = `${tail[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const part = (p: string) => (p === "" ? [] : p.split(":"));
  const head = part(halves[0]);
  const rest = halves.length === 2 ? part(halves[1]) : [];
  if ([...head, ...rest].some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  return [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest].map((g) => parseInt(g, 16));
}

// Закрытый IPv6: ::1 loopback, ::, fe80::/10 link-local, fec0::/10 site-local, fc00::/7 unique-local,
// ff00::/8 multicast, а также адреса, внутри которых лежит IPv4: ::ffff:a.b.c.d (IPv4-mapped),
// ::a.b.c.d, 64:ff9b::/96 (NAT64), 2002::/16 (6to4) — у них проверяется вложенный IPv4.
// URL приводит «[::ffff:127.0.0.1]» к виду «[::ffff:7f00:1]», поэтому сравнивать текст нельзя —
// только разобранные группы: иначе такой адрес проходил проверку и вёл на 127.0.0.1.
// Строка с двоеточием, которую не удалось разобрать как IPv6, считается закрытой.
export function isBlockedIpv6(host: string): boolean {
  if (!host.includes(":")) return false;
  const g = ipv6Groups(host);
  if (!g) return true;
  const v4 = (hi: number, lo: number) => isBlockedIpv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (zero(0, 7) && (g[7] === 0 || g[7] === 1)) return true; // :: и ::1
  if (zero(0, 5) && g[5] === 0xffff) return v4(g[6], g[7]); // ::ffff:a.b.c.d
  if (zero(0, 4) && g[4] === 0xffff && g[5] === 0) return v4(g[6], g[7]); // ::ffff:0:a.b.c.d
  if (zero(0, 6)) return true; // ::a.b.c.d — устаревшая запись IPv4, наружу не ведёт
  if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return v4(g[6], g[7]); // NAT64
  if (g[0] === 0x2002) return v4(g[1], g[2]); // 6to4
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // link-local, site-local
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique-local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

// Закрыт ли IP-литерал (IPv4 или IPv6) — хост, по которому нельзя ходить
export function isBlockedIp(host: string): boolean {
  return isBlockedIpv4(host) || isBlockedIpv6(host);
}

// Явно опасное имя хоста без резолвинга DNS: localhost, IP-литерал из закрытого диапазона.
// Публичное доменное имя тут проходит — его адрес проверяется уже после резолвинга (ssrf-resolve.ts).
export function isBlockedHostname(hostname: string): boolean {
  // Точка в конце («localhost.») — то же имя
  const name = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
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

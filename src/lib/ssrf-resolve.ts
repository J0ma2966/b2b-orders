import "server-only";
import { lookup } from "node:dns/promises";
import { isBlockedIp, parsePushEndpoint } from "./ssrf";

// Полная проверка адреса push-подписки перед тем, как сервер сам к нему обратится:
// 1) схема https и хост не из закрытого списка (localhost, частный IP-литерал);
// 2) резолвинг DNS — ни один из адресов хоста не должен попадать в закрытый диапазон
//    (иначе публичное имя могло бы указывать на 127.0.0.1 или 169.254.169.254).
export async function pushEndpointIsSafe(endpoint: string): Promise<boolean> {
  const parsed = parsePushEndpoint(endpoint);
  if (!parsed.ok) return false;
  // IP-литерал уже проверен в parsePushEndpoint, резолвить нечего
  if (/^[0-9.]+$/.test(parsed.hostname) || parsed.hostname.includes(":")) return true;
  try {
    const addrs = await lookup(parsed.hostname, { all: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isBlockedIp(a.address));
  } catch {
    // Имя не резолвится — отправлять некуда, считаем небезопасным
    return false;
  }
}

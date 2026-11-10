import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { Agent } from "node:https";
import type { LookupFunction } from "node:net";
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

// Проверка выше и само соединение резолвят имя по отдельности: между ними DNS может ответить
// по-другому (сначала публичный адрес, затем 127.0.0.1 — «DNS rebinding»). Поэтому соединение
// push идёт через агент, который проверяет именно тот адрес, к которому подключается.
// IP-литералы сюда не попадают (резолвить нечего) — они проверены в parsePushEndpoint.
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address, family);
    const list: LookupAddress[] = Array.isArray(address) ? address : [{ address, family: family ?? 4 }];
    if (list.length === 0 || list.some((a) => isBlockedIp(a.address))) {
      const blocked = Object.assign(new Error(`push endpoint ${hostname} resolves to a non-public address`), { code: "ESSRFBLOCKED" });
      return callback(blocked, address, family);
    }
    callback(null, address, family);
  });
};

export const pushAgent = new Agent({ lookup: guardedLookup });

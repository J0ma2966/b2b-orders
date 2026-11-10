import { describe, expect, it } from "vitest";
import { isBlockedIp, isBlockedHostname, parsePushEndpoint } from "@/lib/ssrf";

describe("SSRF: закрытые IP-адреса", () => {
  it("закрывает loopback, частные сети, link-local и метаданные облака", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "172.31.255.255", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });
  it("пропускает публичные адреса", () => {
    for (const ip of ["8.8.8.8", "203.0.113.7", "2a00:1450:4001::1", "::ffff:8.8.8.8"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
});

describe("SSRF: имя хоста", () => {
  it("закрывает localhost и приватные IP-литералы", () => {
    for (const h of ["localhost", "app.localhost", "printer.local", "127.0.0.1", "[::1]", "192.168.0.10"]) {
      expect(isBlockedHostname(h), h).toBe(true);
    }
  });
  it("пропускает публичные доменные имена", () => {
    for (const h of ["fcm.googleapis.com", "updates.push.services.mozilla.com", "example.uz"]) {
      expect(isBlockedHostname(h), h).toBe(false);
    }
  });
});

describe("SSRF: адрес push-подписки", () => {
  it("принимает только https на публичный хост", () => {
    expect(parsePushEndpoint("https://fcm.googleapis.com/fcm/send/abc").ok).toBe(true);
    expect(parsePushEndpoint("http://fcm.googleapis.com/x").ok).toBe(false); // не https
    expect(parsePushEndpoint("https://127.0.0.1:9443/x").ok).toBe(false); // loopback
    expect(parsePushEndpoint("https://localhost/x").ok).toBe(false);
    expect(parsePushEndpoint("https://[::1]/x").ok).toBe(false);
    expect(parsePushEndpoint("https://169.254.169.254/latest/meta-data/").ok).toBe(false);
    expect(parsePushEndpoint("not-a-url").ok).toBe(false);
  });
});

// Повторный аудит 2026-11-10: URL приводит «[::ffff:127.0.0.1]» к «[::ffff:7f00:1]», и прежняя
// проверка по тексту такой адрес пропускала — запрос уходил на 127.0.0.1.
describe("SSRF: IPv4 внутри IPv6", () => {
  it("закрывает IPv4-mapped в шестнадцатеричной записи и другие обёртки", () => {
    for (const ip of ["::ffff:7f00:1", "::ffff:a9fe:a9fe", "0:0:0:0:0:ffff:c0a8:1", "::7f00:1", "64:ff9b::7f00:1", "2002:7f00:1::1", "fec0::1", "ff02::1", "febf::1", "::ffff:0:7f00:1", "1:2:3"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });
  it("публичные IPv6 по-прежнему проходят", () => {
    for (const ip of ["2a00:1450:4001:81b::200e", "2606:4700:4700::1111", "::ffff:808:808", "64:ff9b::808:808"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
  it("адрес подписки с такими хостами отклоняется", () => {
    for (const u of ["https://[::ffff:127.0.0.1]:5432/x", "https://[::ffff:169.254.169.254]/", "https://[::127.0.0.1]/", "https://[64:ff9b::7f00:1]/", "https://[fec0::1]/", "https://localhost./x"]) {
      expect(parsePushEndpoint(u).ok, u).toBe(false);
    }
    expect(parsePushEndpoint("https://[2a00:1450:4001:81b::200e]/x").ok).toBe(true);
  });
});


import { describe, expect, it } from "vitest";
import { isLocalNetworkHost, sessionCookieSecure } from "@/lib/auth/cookie-secure";

describe("cookie входа: Secure", () => {
  it("локальные адреса", () => {
    for (const h of ["localhost:3000", "127.0.0.1:3000", "192.168.1.10:3000", "10.0.0.5", "172.16.0.2:3000", "172.31.255.1", "[::1]:3000", "my-pc.local:3000", "100.101.1.2:3000"]) {
      expect(isLocalNetworkHost(h), h).toBe(true);
    }
  });
  it("внешние адреса", () => {
    for (const h of ["zakaz.uz", "app.example.uz:443", "172.32.0.1:3000", "192.169.1.1", "100.128.0.1", "8.8.8.8", "xxxx.trycloudflare.com", "", null]) {
      expect(isLocalNetworkHost(h), String(h)).toBe(false);
    }
  });
  it("в production Secure только для внешнего домена", () => {
    const prod = { NODE_ENV: "production" };
    expect(sessionCookieSecure(prod, "zakaz.uz")).toBe(true);
    expect(sessionCookieSecure(prod, "192.168.1.10:3000")).toBe(false);
    expect(sessionCookieSecure(prod, null)).toBe(true);
    expect(sessionCookieSecure({ ...prod, COOKIE_SECURE: "0" }, "zakaz.uz")).toBe(false);
    expect(sessionCookieSecure({ ...prod, COOKIE_SECURE: "1" }, "192.168.1.10:3000")).toBe(true);
    expect(sessionCookieSecure({ NODE_ENV: "development" }, "zakaz.uz")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/auth/session";
import { initialSuperadminPassword } from "../prisma/superadmin";

describe("адрес клиента для лимита входа", () => {
  it("берёт адрес, добавленный нашим прокси, а не подставленный клиентом", () => {
    expect(clientIp("1.1.1.1, 203.0.113.7", null)).toBe("203.0.113.7");
    expect(clientIp("203.0.113.7", "10.0.0.1")).toBe("203.0.113.7");
    expect(clientIp(null, "10.0.0.1")).toBe("10.0.0.1");
    expect(clientIp(" , ", null)).toBeNull();
  });
});

describe("пароль первого супер-администратора", () => {
  it("пустое SUPERADMIN_PASSWORD из .env.example не даёт пустой пароль", () => {
    expect(initialSuperadminPassword("")).toEqual({ password: "admin12345", mustChange: true });
    expect(initialSuperadminPassword("  ")).toEqual({ password: "admin12345", mustChange: true });
    expect(initialSuperadminPassword(undefined)).toEqual({ password: "admin12345", mustChange: true });
    expect(initialSuperadminPassword("S3cret-pass")).toEqual({ password: "S3cret-pass", mustChange: false });
  });
});

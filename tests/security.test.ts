import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/auth/session";

describe("адрес клиента для лимита входа", () => {
  it("берёт адрес, добавленный нашим прокси, а не подставленный клиентом", () => {
    expect(clientIp("1.1.1.1, 203.0.113.7", null)).toBe("203.0.113.7");
    expect(clientIp("203.0.113.7", "10.0.0.1")).toBe("203.0.113.7");
    expect(clientIp(null, "10.0.0.1")).toBe("10.0.0.1");
    expect(clientIp(" , ", null)).toBeNull();
  });
});

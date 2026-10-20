import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { normalizeInn } from "@/lib/inn";

describe("normalizePhone", () => {
  it.each([
    ["+998 90 123-45-67", "+998901234567"],
    ["998901234567", "+998901234567"],
    ["90 123 45 67", "+998901234567"],
    ["(90) 123-45-67", "+998901234567"],
  ])("%s → %s", (input, out) => expect(normalizePhone(input)).toBe(out));

  it.each(["12345", "+7 900 123 45 67", "", "9989012345678"])("отклоняет %s", (input) =>
    expect(normalizePhone(input)).toBeNull(),
  );

  it("форматирует", () => expect(formatPhone("+998901234567")).toBe("+998 90 123-45-67"));
});

describe("normalizeInn", () => {
  it("принимает 9 и 14 цифр", () => {
    expect(normalizeInn("301 234 567")).toBe("301234567");
    expect(normalizeInn("12345678901234")).toBe("12345678901234");
  });
  it("отклоняет другую длину", () => expect(normalizeInn("1234")).toBeNull());
});

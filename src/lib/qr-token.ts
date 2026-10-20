import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";

// Без похожих символов (0/O, 1/I/L), чтобы код можно было ввести вручную
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateQrToken(length = 10) {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export function normalizeQrInput(input: string) {
  // В QR лежит строка вида B2B-ORDER:<код>; вручную вводят только код
  return input.trim().toUpperCase().replace(/^B2B-ORDER:/, "").replace(/[\s-]/g, "");
}

export function sameToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

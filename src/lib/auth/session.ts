import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "b2b_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_RENEW_MS = 15 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}

export async function createSession(
  userId: string,
  context: { activeSupplierId?: string; activeShopId?: string } = {},
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const meta = await requestMeta();
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, ip: meta.ip, userAgent: meta.userAgent, ...context },
  });
  await setSessionCookie(token, expiresAt);
}

async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function readSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true, actingAsUser: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session;
}

// Продление сессии вызывается из Server Actions (в рендере cookie менять нельзя).
export async function touchSession(sessionId: string, expiresAt: Date) {
  if (expiresAt.getTime() - Date.now() > SESSION_RENEW_MS) return;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return;
  const next = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.update({ where: { id: sessionId }, data: { expiresAt: next, lastSeenAt: new Date() } });
  await setSessionCookie(token, next);
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

export async function destroyAllUserSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}

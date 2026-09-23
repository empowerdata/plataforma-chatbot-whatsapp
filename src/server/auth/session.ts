import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "../db";
import { randomToken, sha256 } from "../crypto";
import { env } from "../env";

export const SESSION_COOKIE = "pc_session";
export const ACT_AS_COOKIE = "pc_act_as";
const SESSION_DAYS = 30;

export async function createSession(userId: string): Promise<void> {
  const db = await getDb();
  const token = randomToken(32);
  const h = await headers();
  await db.insert(schema.sessions).values({
    id: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(ACT_AS_COOKIE);
}

export type SessionUser = typeof schema.users.$inferSelect;

/** Usuário logado (ou null). Cacheado por requisição. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const user = rows[0]?.user ?? null;
  if (!user || !user.isActive) return null;
  return user;
});

/** Conta "atuando como" (só para super admin). */
export async function getActAsAccountId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACT_AS_COOKIE)?.value ?? null;
}

export async function setActAsAccount(accountId: string | null): Promise<void> {
  const jar = await cookies();
  if (!accountId) jar.delete(ACT_AS_COOKIE);
  else jar.set(ACT_AS_COOKIE, accountId, { httpOnly: true, sameSite: "lax", secure: env.isProd, path: "/" });
}

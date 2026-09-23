import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema } from "../db";
import { getActAsAccountId, getSessionUser, type SessionUser } from "./session";
import type { Account } from "../db/schema";

export class AuthError extends Error {}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect("/");
  return user;
}

export type AccountContext = {
  user: SessionUser;
  account: Account;
  /** true quando um super admin está "atuando como" a conta. */
  actingAs: boolean;
};

/**
 * Contexto da conta atual: membro comum usa a própria conta; super admin
 * usa a conta que estiver "atuando como" (cookie) e, na falta dela, a
 * própria conta, se tiver uma (instalação de conta única, onde quem instalou
 * é ao mesmo tempo admin e dono da única conta). Sem nenhuma das duas, vai
 * para /admin/contas escolher uma.
 */
export const requireAccount = cache(async (): Promise<AccountContext> => {
  const user = await requireUser();
  const db = await getDb();
  let accountId = user.accountId;
  let actingAs = false;
  if (user.role === "super_admin") {
    const actAs = await getActAsAccountId();
    if (actAs) {
      accountId = actAs;
      actingAs = true;
    }
    if (!accountId) redirect("/admin/contas");
  }
  if (!accountId) redirect("/login");
  const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).limit(1);
  if (!account) redirect("/login");
  if (account.status !== "active" && user.role !== "super_admin") redirect("/conta-suspensa");
  return { user, account, actingAs };
});

/** Versão para server actions/rotas: lança em vez de redirecionar. */
export async function getAccountOrThrow(): Promise<AccountContext> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Sessão expirada. Faça login novamente.");
  const db = await getDb();
  let accountId = user.accountId;
  let actingAs = false;
  if (user.role === "super_admin") {
    const actAs = await getActAsAccountId();
    if (actAs) {
      accountId = actAs;
      actingAs = true;
    }
  }
  if (!accountId) throw new AuthError("Nenhuma conta selecionada.");
  const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).limit(1);
  if (!account) throw new AuthError("Conta não encontrada.");
  return { user, account, actingAs };
}

export async function getSuperAdminOrThrow(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") throw new AuthError("Acesso restrito ao administrador.");
  return user;
}

import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema } from "../db";
import { getActAsAccountId, getSessionUser, type SessionUser } from "./session";
import type { Account, Client } from "../db/schema";

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
  // Login de cliente final (portal, escopado a um único client_id) nunca deve
  // cair no painel da equipe — mesmo tendo accountId preenchido.
  if (user.role === "client") redirect("/portal/conversas");
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
  if (user.role === "client") throw new AuthError("Acesso restrito à equipe da conta.");
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

export type ClientPortalContext = { user: SessionUser; account: Account; client: Client };

/** Contexto do portal do cliente final: nunca alcança dados fora de user.clientId. */
export const requireClientAccess = cache(async (): Promise<ClientPortalContext> => {
  const user = await requireUser();
  if (user.role !== "client" || !user.accountId || !user.clientId) redirect(user.role === "client" ? "/login" : "/");
  const db = await getDb();
  const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, user.accountId)).limit(1);
  if (!account || account.status !== "active") redirect("/login");
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, user.clientId)).limit(1);
  if (!client || !client.isActive || client.accountId !== account.id) redirect("/login");
  return { user, account, client };
});

/** Versão para server actions/rotas do portal: lança em vez de redirecionar. */
export async function getClientAccessOrThrow(): Promise<ClientPortalContext> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Sessão expirada. Faça login novamente.");
  if (user.role !== "client" || !user.accountId || !user.clientId) throw new AuthError("Acesso restrito ao portal do cliente.");
  const db = await getDb();
  const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, user.accountId)).limit(1);
  if (!account || account.status !== "active") throw new AuthError("Conta suspensa.");
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, user.clientId)).limit(1);
  if (!client || !client.isActive || client.accountId !== account.id) throw new AuthError("Acesso revogado.");
  return { user, account, client };
}

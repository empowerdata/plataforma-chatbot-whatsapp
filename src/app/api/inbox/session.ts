import "server-only";
import { getAccountOrThrow, getClientAccessOrThrow } from "@/server/auth/guards";
import { getSessionUser } from "@/server/auth/session";
import type { InboxScope } from "@/server/services/inbox";

/**
 * Escopo da caixa de entrada a partir da sessão, para as rotas usadas pelos dois
 * lados (equipe e portal): o login decide, nunca o navegador.
 */
export async function inboxScopeFromSession(): Promise<{ scope: InboxScope; author: string }> {
  const session = await getSessionUser();
  if (session?.role === "client") {
    const { client, user } = await getClientAccessOrThrow();
    return { scope: { accountId: client.accountId, clientId: client.id, staff: false }, author: user.name };
  }
  const { account, user } = await getAccountOrThrow();
  return { scope: { accountId: account.id, clientId: null, staff: true }, author: user.name };
}

import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getTenantStore } from "../tenant";

/**
 * Indicadores do portal do cliente final. As conversas em si passam pela
 * caixa de entrada (services/inbox.ts). Tudo aqui filtra por clientId além do
 * accountId: um cliente nunca vê número nem métrica de outro cliente da conta.
 */

async function clientNumbers(accountId: string, clientId: string) {
  const db = await getDb();
  return db
    .select({ id: schema.numbers.id })
    .from(schema.numbers)
    .where(and(eq(schema.numbers.accountId, accountId), eq(schema.numbers.clientId, clientId)));
}

export type PortalOverview = {
  open: number;
  resolvedRecent: number;
  needsHuman: number;
  categories: { category: string; n: number }[];
};

/** Aberto = TODAS as pendentes, sem corte de período (um lead de 40 dias atrás não pode sumir sozinho). */
export async function getPortalOverview(accountId: string, clientId: string, days: number): Promise<PortalOverview> {
  const numberIds = (await clientNumbers(accountId, clientId)).map((n) => n.id);
  const store = await getTenantStore(accountId);
  const since = new Date(Date.now() - days * 86400_000);
  const [open, resolvedRecent, needsHuman, categories] = await Promise.all([
    store.countConversations({ numberIds, resolved: false }),
    store.countConversations({ numberIds, resolved: true, activeSince: since }),
    store.countConversations({ numberIds, resolved: false, needsHuman: true }),
    store.categoryBreakdown({ numberIds, resolved: false }),
  ]);
  return { open, resolvedRecent, needsHuman, categories };
}

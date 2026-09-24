import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getTenantStore, type Conversation, type MessageRow, type Contact } from "../tenant";

/**
 * Serviço do PORTAL DO CLIENTE FINAL — nunca reaproveita as funções de
 * src/server/services/conversations.ts (essas só filtram por accountId).
 * Toda consulta aqui filtra explicitamente por clientId também, para que um
 * cliente jamais veja o número, a conversa ou a métrica de outro cliente da
 * mesma conta, mesmo que adivinhe um id.
 */

async function clientNumbers(accountId: string, clientId: string) {
  const db = await getDb();
  return db
    .select({ id: schema.numbers.id, label: schema.numbers.label })
    .from(schema.numbers)
    .where(and(eq(schema.numbers.accountId, accountId), eq(schema.numbers.clientId, clientId)));
}

export type PortalConversationListItem = Conversation & {
  contact_phone: string | null;
  contact_name: string | null;
  contact_push_name: string | null;
  numberLabel: string;
};

export async function listPortalConversations(
  accountId: string,
  clientId: string,
  opts: { category?: string; resolved?: boolean; limit?: number; offset?: number } = {},
): Promise<PortalConversationListItem[]> {
  const nums = await clientNumbers(accountId, clientId);
  if (!nums.length) return [];
  const labels = new Map(nums.map((n) => [n.id, n.label]));
  const store = await getTenantStore(accountId);
  const rows = await store.listConversations({ numberIds: nums.map((n) => n.id), category: opts.category, resolved: opts.resolved, limit: opts.limit, offset: opts.offset });
  return rows.map((r) => ({ ...r, numberLabel: labels.get(r.number_id) ?? "—" }));
}

export async function listPortalUsedCategories(accountId: string, clientId: string): Promise<string[]> {
  const nums = await clientNumbers(accountId, clientId);
  if (!nums.length) return [];
  try {
    const store = await getTenantStore(accountId);
    return await store.listCategoriesInUse(nums.map((n) => n.id));
  } catch {
    return [];
  }
}

export type PortalConversationDetail = { conversation: Conversation; contact: Contact; messages: MessageRow[]; numberLabel: string };

/** `null` se a conversa não existir ou não pertencer a um número deste cliente. */
export async function getPortalConversationDetail(accountId: string, clientId: string, conversationId: string): Promise<PortalConversationDetail | null> {
  const store = await getTenantStore(accountId);
  const conversation = await store.getConversation(conversationId);
  if (!conversation) return null;
  const nums = await clientNumbers(accountId, clientId);
  const num = nums.find((n) => n.id === conversation.number_id);
  if (!num) return null;
  const contact = await store.getContact(conversation.contact_id);
  if (!contact) return null;
  const messages = await store.listMessages(conversationId);
  return { conversation, contact, messages, numberLabel: num.label };
}

export async function setPortalConversationCategory(accountId: string, clientId: string, conversationId: string, category: string | null): Promise<void> {
  const detail = await getPortalConversationDetail(accountId, clientId, conversationId);
  if (!detail) throw new Error("Conversa não encontrada.");
  const store = await getTenantStore(accountId);
  await store.setConversationCategory(conversationId, category);
}

export async function setPortalConversationResolved(accountId: string, clientId: string, conversationId: string, resolved: boolean): Promise<void> {
  const detail = await getPortalConversationDetail(accountId, clientId, conversationId);
  if (!detail) throw new Error("Conversa não encontrada.");
  const store = await getTenantStore(accountId);
  await store.setConversationResolved(conversationId, resolved);
}

export type PortalOverview = {
  open: number;
  resolvedRecent: number;
  needsHuman: number;
  categories: { category: string; n: number }[];
};

/** Aberto = TODAS as pendentes, sem corte de período (um lead de 40 dias atrás não pode sumir sozinho). */
export async function getPortalOverview(accountId: string, clientId: string, days: number): Promise<PortalOverview> {
  const nums = await clientNumbers(accountId, clientId);
  const numberIds = nums.map((n) => n.id);
  const store = await getTenantStore(accountId);
  const since = new Date(Date.now() - days * 86400_000);
  const [open, resolvedRecent, needsHuman, categories] = await Promise.all([
    store.countConversations({ numberIds, resolved: false }),
    store.countConversations({ numberIds, resolved: true, activeSince: since }),
    store.countOpenNeedsHuman(numberIds),
    store.categoryBreakdown({ numberIds, resolved: false }),
  ]);
  return { open, resolvedRecent, needsHuman, categories };
}

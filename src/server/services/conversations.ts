import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getTenantStore, type Conversation, type MessageRow, type Contact } from "../tenant";

export type ConversationListItem = Conversation & {
  contact_phone: string | null;
  contact_name: string | null;
  contact_push_name: string | null;
  numberLabel: string;
};

async function accountNumbers(accountId: string) {
  const db = await getDb();
  return db.select({ id: schema.numbers.id, label: schema.numbers.label }).from(schema.numbers).where(eq(schema.numbers.accountId, accountId));
}

export async function listConversations(accountId: string, opts: { numberId?: string; needsHuman?: boolean; category?: string; limit?: number; offset?: number } = {}): Promise<ConversationListItem[]> {
  const nums = await accountNumbers(accountId);
  if (!nums.length) return [];
  const labels = new Map(nums.map((n) => [n.id, n.label]));
  const store = await getTenantStore(accountId);
  const rows = await store.listConversations({ numberId: opts.numberId, numberIds: opts.numberId ? undefined : nums.map((n) => n.id), needsHuman: opts.needsHuman, category: opts.category, limit: opts.limit, offset: opts.offset });
  return rows.map((r) => ({ ...r, numberLabel: labels.get(r.number_id) ?? "—" }));
}

/** Categorias em uso pela conta, para alimentar o filtro da lista. */
export async function listUsedCategories(accountId: string): Promise<string[]> {
  const nums = await accountNumbers(accountId);
  if (!nums.length) return [];
  try {
    const store = await getTenantStore(accountId);
    return await store.listCategoriesInUse(nums.map((n) => n.id));
  } catch {
    return [];
  }
}

export type ConversationDetail = { conversation: Conversation; contact: Contact; messages: MessageRow[]; numberLabel: string };

export async function getConversationDetail(accountId: string, conversationId: string): Promise<ConversationDetail | null> {
  const store = await getTenantStore(accountId);
  const conversation = await store.getConversation(conversationId);
  if (!conversation) return null;
  const nums = await accountNumbers(accountId);
  const num = nums.find((n) => n.id === conversation.number_id);
  if (!num) return null; // conversa de outra conta
  const contact = await store.getContact(conversation.contact_id);
  if (!contact) return null;
  const messages = await store.listMessages(conversationId);
  return { conversation, contact, messages, numberLabel: num.label };
}

export async function resolveConversation(accountId: string, conversationId: string): Promise<void> {
  const detail = await getConversationDetail(accountId, conversationId);
  if (!detail) throw new Error("Conversa não encontrada.");
  const store = await getTenantStore(accountId);
  await store.setConversationStatus(conversationId, "open", false, null);
  await store.pauseContactBot(detail.contact.id, null);
}

export async function setBotPausedForContact(accountId: string, conversationId: string, hours: number | null): Promise<void> {
  const detail = await getConversationDetail(accountId, conversationId);
  if (!detail) throw new Error("Conversa não encontrada.");
  const store = await getTenantStore(accountId);
  await store.pauseContactBot(detail.contact.id, hours ? new Date(Date.now() + hours * 3600_000) : null);
}

export async function setContactBlocked(accountId: string, conversationId: string, blocked: boolean): Promise<void> {
  const detail = await getConversationDetail(accountId, conversationId);
  if (!detail) throw new Error("Conversa não encontrada.");
  const store = await getTenantStore(accountId);
  await store.setContactBlocked(detail.contact.id, blocked);
}

export async function setConversationCategory(accountId: string, conversationId: string, category: string | null): Promise<void> {
  const detail = await getConversationDetail(accountId, conversationId);
  if (!detail) throw new Error("Conversa não encontrada.");
  const store = await getTenantStore(accountId);
  await store.setConversationCategory(conversationId, category);
}

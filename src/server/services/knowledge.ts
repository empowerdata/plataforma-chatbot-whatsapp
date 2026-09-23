import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { embedMany } from "ai";
import { getDb, schema } from "../db";
import type { KnowledgeItem } from "../db/schema";
import { getAccountAi } from "../ai/provider";
import { chunkText, extractTextFromFile, faqToChunks, htmlToText, parseFaq, serializeFaq } from "../ai/text";
import { getTenantStore } from "../tenant";

const MAX_CHARS = 400_000;

export async function listKnowledge(accountId: string, botId: string): Promise<KnowledgeItem[]> {
  const db = await getDb();
  return db.select().from(schema.knowledgeItems).where(and(eq(schema.knowledgeItems.botId, botId), eq(schema.knowledgeItems.accountId, accountId))).orderBy(asc(schema.knowledgeItems.createdAt));
}

async function insertItem(input: { accountId: string; botId: string; kind: KnowledgeItem["kind"]; title: string; content: string; sourceName?: string | null; sourceUrl?: string | null }): Promise<KnowledgeItem> {
  const db = await getDb();
  const content = input.content.slice(0, MAX_CHARS);
  const [row] = await db
    .insert(schema.knowledgeItems)
    .values({ accountId: input.accountId, botId: input.botId, kind: input.kind, title: input.title.trim() || "Sem título", content, sourceName: input.sourceName ?? null, sourceUrl: input.sourceUrl ?? null, charCount: content.length })
    .returning();
  await reindexItem(input.accountId, row.id);
  return (await getItem(input.accountId, row.id))!;
}

export async function getItem(accountId: string, id: string): Promise<KnowledgeItem | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.knowledgeItems).where(and(eq(schema.knowledgeItems.id, id), eq(schema.knowledgeItems.accountId, accountId))).limit(1);
  return row ?? null;
}

export async function addTextItem(input: { accountId: string; botId: string; title: string; content: string }) {
  if (!input.content.trim()) throw new Error("O texto está vazio.");
  return insertItem({ ...input, kind: "text" });
}

export async function addFaqItem(input: { accountId: string; botId: string; title: string; pairs: { q: string; a: string }[] }) {
  const pairs = input.pairs.filter((p) => p.q.trim() && p.a.trim());
  if (!pairs.length) throw new Error("Adicione pelo menos uma pergunta com resposta.");
  return insertItem({ accountId: input.accountId, botId: input.botId, kind: "faq", title: input.title, content: serializeFaq(pairs) });
}

export async function addFileItem(input: { accountId: string; botId: string; file: { name: string; buffer: Buffer; mimeType?: string } }) {
  const text = await extractTextFromFile(input.file);
  if (!text.trim()) throw new Error("Não foi possível extrair texto deste arquivo (pode ser um PDF só com imagens).");
  return insertItem({ accountId: input.accountId, botId: input.botId, kind: "file", title: input.file.name, content: text, sourceName: input.file.name });
}

export async function addUrlItem(input: { accountId: string; botId: string; url: string }) {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("Informe um link começando com http:// ou https://.");
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; PlataformaChatbot/1.0)" }, signal: AbortSignal.timeout(20_000), redirect: "follow" });
  if (!res.ok) throw new Error(`O site respondeu ${res.status}.`);
  const html = await res.text();
  const text = htmlToText(html);
  if (text.length < 40) throw new Error("A página não tem texto legível (pode carregar o conteúdo por JavaScript). Copie o texto e adicione como Texto.");
  const title = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim() || url;
  return insertItem({ accountId: input.accountId, botId: input.botId, kind: "url", title, content: text, sourceUrl: url });
}

export async function updateItem(accountId: string, id: string, patch: { title?: string; content?: string; pairs?: { q: string; a: string }[] }) {
  const db = await getDb();
  const item = await getItem(accountId, id);
  if (!item) throw new Error("Item não encontrado.");
  const content = patch.pairs ? serializeFaq(patch.pairs) : patch.content !== undefined ? patch.content.slice(0, MAX_CHARS) : item.content;
  await db
    .update(schema.knowledgeItems)
    .set({ title: patch.title?.trim() || item.title, content, charCount: content.length, status: "pending", updatedAt: new Date() })
    .where(eq(schema.knowledgeItems.id, id));
  await reindexItem(accountId, id);
}

export async function deleteItem(accountId: string, id: string) {
  const db = await getDb();
  const item = await getItem(accountId, id);
  if (!item) return;
  try {
    const store = await getTenantStore(accountId);
    await store.deleteChunks(id);
  } catch {}
  await db.delete(schema.knowledgeItems).where(eq(schema.knowledgeItems.id, id));
}

/** Divide em trechos, gera embeddings (se houver IA) e grava no banco do aluno. */
export async function reindexItem(accountId: string, id: string): Promise<void> {
  const db = await getDb();
  const item = await getItem(accountId, id);
  if (!item) return;
  await db.update(schema.knowledgeItems).set({ status: "indexing", error: null, updatedAt: new Date() }).where(eq(schema.knowledgeItems.id, id));
  try {
    const chunks = item.kind === "faq" ? faqToChunks(parseFaq(item.content)) : chunkText(item.content);
    const ai = await getAccountAi(accountId);
    const model = ai.embeddingModel();
    let embeddings: (number[] | null)[] = chunks.map(() => null);
    if (model && chunks.length) {
      embeddings = [];
      for (let i = 0; i < chunks.length; i += 64) {
        const batch = chunks.slice(i, i + 64);
        const res = await embedMany({ model, values: batch });
        embeddings.push(...res.embeddings);
      }
    }
    const store = await getTenantStore(accountId);
    await store.replaceChunks({ botId: item.botId, itemId: item.id, chunks: chunks.map((content, i) => ({ content, embedding: embeddings[i] })) });
    await db
      .update(schema.knowledgeItems)
      .set({ status: "ready", chunkCount: chunks.length, error: model ? null : "Indexado sem embeddings (sem chave OpenAI): busca por palavras.", updatedAt: new Date() })
      .where(eq(schema.knowledgeItems.id, id));
  } catch (err) {
    await db
      .update(schema.knowledgeItems)
      .set({ status: "error", error: (err instanceof Error ? err.message : String(err)).slice(0, 400), updatedAt: new Date() })
      .where(eq(schema.knowledgeItems.id, id));
  }
}

export async function reindexBot(accountId: string, botId: string): Promise<void> {
  const items = await listKnowledge(accountId, botId);
  for (const it of items) await reindexItem(accountId, it.id);
}

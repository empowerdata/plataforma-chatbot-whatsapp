import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Bot } from "../db/schema";
import { botConfigSchema, defaultBotConfig, getTemplate, type BotConfigInput } from "@/shared/bot-config";
import { getTenantStore } from "../tenant";
import { addFaqItem } from "./knowledge";

export type BotListItem = { bot: Bot; numbers: number; knowledge: number };

export async function listBots(accountId: string): Promise<BotListItem[]> {
  const db = await getDb();
  return db
    .select({
      bot: schema.bots,
      numbers: db.$count(schema.numbers, eq(schema.numbers.botId, schema.bots.id)),
      knowledge: db.$count(schema.knowledgeItems, eq(schema.knowledgeItems.botId, schema.bots.id)),
    })
    .from(schema.bots)
    .where(eq(schema.bots.accountId, accountId))
    .orderBy(desc(schema.bots.createdAt));
}

export async function getBot(accountId: string, id: string): Promise<Bot | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.bots).where(and(eq(schema.bots.id, id), eq(schema.bots.accountId, accountId))).limit(1);
  return row ?? null;
}

export async function createBot(input: { accountId: string; name: string; templateKey?: string | null; businessName?: string }): Promise<Bot> {
  const db = await getDb();
  const template = input.templateKey ? getTemplate(input.templateKey) : undefined;
  const config = defaultBotConfig({
    ...(template?.config ?? {}),
    identity: { ...(template?.config.identity ?? {}), businessName: input.businessName ?? template?.config.identity?.businessName ?? "" },
  });
  const [bot] = await db
    .insert(schema.bots)
    .values({ accountId: input.accountId, name: input.name.trim(), templateKey: template?.key ?? null, config })
    .returning();
  if (template?.faq.length) {
    await addFaqItem({ accountId: input.accountId, botId: bot.id, title: "Perguntas frequentes", pairs: template.faq }).catch((err) => console.error("[bots] falha ao criar FAQ do modelo", err));
  }
  return bot;
}

export async function updateBot(accountId: string, id: string, patch: { name?: string; config?: BotConfigInput; isActive?: boolean }): Promise<Bot> {
  const db = await getDb();
  const set: Partial<typeof schema.bots.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.config !== undefined) set.config = botConfigSchema.parse(patch.config);
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  const [row] = await db.update(schema.bots).set(set).where(and(eq(schema.bots.id, id), eq(schema.bots.accountId, accountId))).returning();
  if (!row) throw new Error("Bot não encontrado.");
  return row;
}

export async function publishBot(accountId: string, id: string): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.bots)
    .set({ version: sql`${schema.bots.version} + 1`, publishedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.bots.id, id), eq(schema.bots.accountId, accountId)));
}

export async function duplicateBot(accountId: string, id: string): Promise<Bot> {
  const db = await getDb();
  const src = await getBot(accountId, id);
  if (!src) throw new Error("Bot não encontrado.");
  const [bot] = await db.insert(schema.bots).values({ accountId, name: `${src.name} (cópia)`, templateKey: src.templateKey, config: src.config }).returning();
  const items = await db.select().from(schema.knowledgeItems).where(eq(schema.knowledgeItems.botId, id));
  const { reindexItem } = await import("./knowledge");
  for (const it of items) {
    const [copy] = await db.insert(schema.knowledgeItems).values({ accountId, botId: bot.id, kind: it.kind, title: it.title, content: it.content, sourceName: it.sourceName, sourceUrl: it.sourceUrl, status: "pending", charCount: it.charCount }).returning();
    await reindexItem(accountId, copy.id).catch(() => {});
  }
  return bot;
}

export async function deleteBot(accountId: string, id: string): Promise<void> {
  const db = await getDb();
  try {
    const store = await getTenantStore(accountId);
    await store.deleteBotChunks(id);
  } catch {}
  await db.delete(schema.bots).where(and(eq(schema.bots.id, id), eq(schema.bots.accountId, accountId)));
}

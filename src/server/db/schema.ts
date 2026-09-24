import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { BotConfig } from "@/shared/bot-config";
import type { NumberSettings } from "@/shared/number-settings";

/**
 * PLANO DE CONTROLE — banco da plataforma (nosso).
 * Aqui ficam contas, logins, integrações (segredos criptografados), servidores
 * Evolution, clientes, números, bots e itens de conhecimento (metadados).
 * Conversas, contatos, embeddings e estatísticas ficam no Supabase do aluno
 * (ver src/server/tenant/schema.sql).
 */

export const userRole = pgEnum("user_role", ["super_admin", "member", "client"]);
export const accountStatus = pgEnum("account_status", ["active", "suspended"]);
export const nodeKind = pgEnum("node_kind", ["http", "fake"]);
export const numberStatus = pgEnum("number_status", ["created", "qr", "connecting", "open", "close", "banned"]);
export const knowledgeKind = pgEnum("knowledge_kind", ["text", "faq", "file", "url"]);
export const knowledgeStatus = pgEnum("knowledge_status", ["pending", "indexing", "ready", "error"]);
export const integrationStatus = pgEnum("integration_status", ["unconfigured", "ok", "error"]);
export const eventLevel = pgEnum("event_level", ["info", "warn", "error"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export type AccountPlan = {
  /** Números incluídos no plano sem custo extra. */
  includedNumbers: number;
  /** Limite duro de números (0 = sem limite). */
  maxNumbers: number;
  maxBots: number;
};

export type AccountBranding = {
  productName?: string;
  logoUrl?: string;
};

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: accountStatus("status").default("active").notNull(),
    plan: jsonb("plan").$type<AccountPlan>().default({ includedNumbers: 3, maxNumbers: 0, maxBots: 0 }).notNull(),
    branding: jsonb("branding").$type<AccountBranding>().default({}).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("accounts_slug_idx").on(t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    /** Só para role "client": o negócio (chatbot.clients) que este login pode ver — nunca a conta inteira. */
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    role: userRole("role").default("member").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`), index("users_account_idx").on(t.accountId), index("users_client_idx").on(t.clientId)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 do token entregue no cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordTokens = pgTable("password_tokens", {
  /** sha256 do token do link "definir senha". */
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const integrations = pgTable("integrations", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  /** String de conexão Postgres do Supabase do aluno (criptografada). */
  supabaseDbUrlEnc: text("supabase_db_url_enc"),
  supabaseStatus: integrationStatus("supabase_status").default("unconfigured").notNull(),
  supabaseSchemaVersion: integer("supabase_schema_version").default(0).notNull(),
  supabaseCheckedAt: timestamp("supabase_checked_at", { withTimezone: true }),
  supabaseError: text("supabase_error"),
  /** Chave OpenAI do aluno (criptografada). */
  openaiKeyEnc: text("openai_key_enc"),
  openaiModel: text("openai_model").default("gpt-5.4-mini").notNull(),
  openaiStatus: integrationStatus("openai_status").default("unconfigured").notNull(),
  openaiCheckedAt: timestamp("openai_checked_at", { withTimezone: true }),
  openaiError: text("openai_error"),
  ...timestamps,
});

export const evolutionNodes = pgTable("evolution_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: nodeKind("kind").default("http").notNull(),
  baseUrl: text("base_url").notNull(),
  apiKeyEnc: text("api_key_enc").notNull(),
  capacity: integer("capacity").default(40).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
  lastHealthOk: boolean("last_health_ok"),
  lastHealthError: text("last_health_error"),
  version: text("version"),
  notes: text("notes"),
  ...timestamps,
});

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    segment: text("segment"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    city: text("city"),
    notes: text("notes"),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [index("clients_account_idx").on(t.accountId)],
);

export const bots = pgTable(
  "bots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    templateKey: text("template_key"),
    config: jsonb("config").$type<BotConfig>().notNull(),
    version: integer("version").default(1).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [index("bots_account_idx").on(t.accountId)],
);

export const numbers = pgTable(
  "numbers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    botId: uuid("bot_id").references(() => bots.id, { onDelete: "set null" }),
    nodeId: uuid("node_id")
      .references(() => evolutionNodes.id, { onDelete: "restrict" })
      .notNull(),
    label: text("label").notNull(),
    /** Telefone conectado (E.164 sem +), preenchido quando a sessão abre. */
    phone: text("phone"),
    profileName: text("profile_name"),
    /** Nome da instância na Evolution (único no servidor). */
    instanceName: text("instance_name").notNull(),
    /** apikey da instância na Evolution (criptografada). */
    instanceTokenEnc: text("instance_token_enc"),
    /** Token secreto que vai na URL do webhook. */
    webhookToken: text("webhook_token").notNull(),
    status: numberStatus("status").default("created").notNull(),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastQr: text("last_qr"),
    lastQrAt: timestamp("last_qr_at", { withTimezone: true }),
    pairingCode: text("pairing_code"),
    /** Variáveis {{...}} aplicadas no prompt do bot para este número. */
    variables: jsonb("variables").$type<Record<string, string>>().default({}).notNull(),
    settings: jsonb("settings").$type<NumberSettings>().default({}).notNull(),
    botEnabled: boolean("bot_enabled").default(true).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [
    index("numbers_account_idx").on(t.accountId),
    uniqueIndex("numbers_instance_idx").on(t.instanceName),
    uniqueIndex("numbers_webhook_idx").on(t.webhookToken),
  ],
);

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    botId: uuid("bot_id")
      .references(() => bots.id, { onDelete: "cascade" })
      .notNull(),
    kind: knowledgeKind("kind").notNull(),
    title: text("title").notNull(),
    /** Texto bruto (texto livre, "P: ... R: ..." no caso de FAQ, texto extraído de arquivo/URL). */
    content: text("content").notNull(),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    status: knowledgeStatus("status").default("pending").notNull(),
    error: text("error"),
    chunkCount: integer("chunk_count").default(0).notNull(),
    charCount: integer("char_count").default(0).notNull(),
    ...timestamps,
  },
  (t) => [index("knowledge_bot_idx").on(t.botId)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    numberId: uuid("number_id").references(() => numbers.id, { onDelete: "cascade" }),
    level: eventLevel("level").default("info").notNull(),
    type: text("type").notNull(),
    message: text("message").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("events_account_idx").on(t.accountId, t.createdAt), index("events_number_idx").on(t.numberId, t.createdAt)],
);

export type Account = typeof accounts.$inferSelect;
export type User = typeof users.$inferSelect;
export type Integration = typeof integrations.$inferSelect;
export type EvolutionNode = typeof evolutionNodes.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Bot = typeof bots.$inferSelect;
export type NumberRow = typeof numbers.$inferSelect;
export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
export type EventRow = typeof events.$inferSelect;

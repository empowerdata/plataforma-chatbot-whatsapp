import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { decryptSecret, encryptSecret, maskSecret } from "../crypto";
import { closeTenant, createPostgresExecutor, installSchema, TENANT_SCHEMA_VERSION, testConnection, friendlyPgError } from "../tenant";
import { DEFAULT_CHAT_MODEL, testOpenAiKey } from "../ai/provider";
import { env } from "../env";

export type IntegrationView = {
  supabase: {
    configured: boolean;
    status: "unconfigured" | "ok" | "error";
    error: string | null;
    checkedAt: Date | null;
    schemaVersion: number;
    latestVersion: number;
    masked: string | null;
    /** Sem Supabase, a instalação própria usa o Postgres do próprio servidor (padrão). */
    usingServerDb: boolean;
    /** Em dev sem Supabase configurado usamos um banco local. */
    usingLocalDev: boolean;
  };
  openai: {
    configured: boolean;
    status: "unconfigured" | "ok" | "error";
    error: string | null;
    checkedAt: Date | null;
    masked: string | null;
    model: string;
    usingDevKey: boolean;
  };
};

async function ensureRow(accountId: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.integrations).where(eq(schema.integrations.accountId, accountId)).limit(1);
  if (row) return row;
  const [created] = await db.insert(schema.integrations).values({ accountId }).returning();
  return created;
}

export async function getIntegrationView(accountId: string): Promise<IntegrationView> {
  const row = await ensureRow(accountId);
  const dbUrl = row.supabaseDbUrlEnc ? decryptSecret(row.supabaseDbUrlEnc) : null;
  const key = row.openaiKeyEnc ? decryptSecret(row.openaiKeyEnc) : null;
  return {
    supabase: {
      configured: !!dbUrl,
      status: row.supabaseStatus,
      error: row.supabaseError,
      checkedAt: row.supabaseCheckedAt,
      schemaVersion: row.supabaseSchemaVersion,
      latestVersion: TENANT_SCHEMA_VERSION,
      masked: dbUrl ? maskDbUrl(dbUrl) : null,
      usingServerDb: !dbUrl && !!env.DATA_DATABASE_URL,
      usingLocalDev: !dbUrl && !env.DATA_DATABASE_URL && !env.isProd,
    },
    openai: {
      configured: !!key,
      status: row.openaiStatus,
      error: row.openaiError,
      checkedAt: row.openaiCheckedAt,
      masked: key ? maskSecret(key, 5) : null,
      model: row.openaiModel || DEFAULT_CHAT_MODEL,
      usingDevKey: !key && !!env.DEV_OPENAI_API_KEY && !env.isProd,
    },
  };
}

function maskDbUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:••••••@${u.hostname}:${u.port}${u.pathname}`;
  } catch {
    return maskSecret(url, 6);
  }
}

/** Valida, instala o schema e salva a string de conexão do Supabase do aluno. */
export async function saveSupabaseUrl(accountId: string, rawUrl: string): Promise<{ ok: boolean; error?: string; schemaVersion?: number }> {
  const db = await getDb();
  const url = rawUrl.trim();
  if (!/^postgres(ql)?:\/\//i.test(url)) return { ok: false, error: "A string precisa começar com postgresql://. Copie do botão Connect do Supabase." };
  if (/\[YOUR-PASSWORD\]/i.test(url)) return { ok: false, error: "Substitua [YOUR-PASSWORD] pela senha do banco antes de colar." };
  const test = await testConnection(url);
  if (!test.ok) {
    await db.update(schema.integrations).set({ supabaseStatus: "error", supabaseError: test.error ?? "Falha na conexão", supabaseCheckedAt: new Date(), updatedAt: new Date() }).where(eq(schema.integrations.accountId, accountId));
    return { ok: false, error: test.error };
  }
  if (test.hasVector === false) {
    return { ok: false, error: "Este banco não tem a extensão pgvector disponível. Use um projeto Supabase (a extensão já vem instalada)." };
  }
  let version = 0;
  let executor = null as Awaited<ReturnType<typeof createPostgresExecutor>> | null;
  try {
    executor = await createPostgresExecutor(url);
    version = await installSchema(executor);
  } catch (err) {
    const msg = friendlyPgError(err);
    await db.update(schema.integrations).set({ supabaseStatus: "error", supabaseError: `Conectou, mas falhou ao instalar as tabelas: ${msg}`, supabaseCheckedAt: new Date(), updatedAt: new Date() }).where(eq(schema.integrations.accountId, accountId));
    return { ok: false, error: `Conectou, mas falhou ao instalar as tabelas: ${msg}` };
  } finally {
    await executor?.close().catch(() => {});
  }
  await ensureRow(accountId);
  await db
    .update(schema.integrations)
    .set({ supabaseDbUrlEnc: encryptSecret(url), supabaseStatus: "ok", supabaseError: null, supabaseCheckedAt: new Date(), supabaseSchemaVersion: version, updatedAt: new Date() })
    .where(eq(schema.integrations.accountId, accountId));
  await closeTenant(accountId);
  return { ok: true, schemaVersion: version };
}

export async function recheckSupabase(accountId: string): Promise<{ ok: boolean; error?: string; schemaVersion?: number }> {
  const db = await getDb();
  const row = await ensureRow(accountId);
  if (!row.supabaseDbUrlEnc) return { ok: false, error: "Nenhum Supabase configurado." };
  const url = decryptSecret(row.supabaseDbUrlEnc);
  const test = await testConnection(url);
  let version = test.schemaVersion ?? 0;
  if (test.ok && version < TENANT_SCHEMA_VERSION) {
    const executor = await createPostgresExecutor(url);
    try {
      version = await installSchema(executor);
    } finally {
      await executor.close().catch(() => {});
    }
  }
  await db
    .update(schema.integrations)
    .set({ supabaseStatus: test.ok ? "ok" : "error", supabaseError: test.error ?? null, supabaseCheckedAt: new Date(), supabaseSchemaVersion: test.ok ? version : row.supabaseSchemaVersion, updatedAt: new Date() })
    .where(eq(schema.integrations.accountId, accountId));
  return { ok: test.ok, error: test.error, schemaVersion: version };
}

export async function removeSupabase(accountId: string): Promise<void> {
  const db = await getDb();
  await db.update(schema.integrations).set({ supabaseDbUrlEnc: null, supabaseStatus: "unconfigured", supabaseError: null, supabaseSchemaVersion: 0, updatedAt: new Date() }).where(eq(schema.integrations.accountId, accountId));
  await closeTenant(accountId);
}

export async function saveOpenAiKey(accountId: string, rawKey: string, model?: string): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  const key = rawKey.trim();
  if (!/^sk-/.test(key)) return { ok: false, error: "A chave da OpenAI começa com sk-. Copie a chave inteira." };
  const test = await testOpenAiKey(key);
  await ensureRow(accountId);
  if (!test.ok) {
    await db.update(schema.integrations).set({ openaiStatus: "error", openaiError: test.error ?? "Falha", openaiCheckedAt: new Date(), updatedAt: new Date() }).where(eq(schema.integrations.accountId, accountId));
    return { ok: false, error: test.error };
  }
  await db
    .update(schema.integrations)
    .set({ openaiKeyEnc: encryptSecret(key), openaiStatus: "ok", openaiError: null, openaiCheckedAt: new Date(), openaiModel: model || DEFAULT_CHAT_MODEL, updatedAt: new Date() })
    .where(eq(schema.integrations.accountId, accountId));
  return { ok: true };
}

export async function recheckOpenAi(accountId: string): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  const row = await ensureRow(accountId);
  if (!row.openaiKeyEnc) return { ok: false, error: "Nenhuma chave configurada." };
  const test = await testOpenAiKey(decryptSecret(row.openaiKeyEnc));
  await db.update(schema.integrations).set({ openaiStatus: test.ok ? "ok" : "error", openaiError: test.error ?? null, openaiCheckedAt: new Date(), updatedAt: new Date() }).where(eq(schema.integrations.accountId, accountId));
  return test;
}

export async function setOpenAiModel(accountId: string, model: string): Promise<void> {
  const db = await getDb();
  await ensureRow(accountId);
  await db.update(schema.integrations).set({ openaiModel: model, updatedAt: new Date() }).where(eq(schema.integrations.accountId, accountId));
}

export async function removeOpenAi(accountId: string): Promise<void> {
  const db = await getDb();
  await db.update(schema.integrations).set({ openaiKeyEnc: null, openaiStatus: "unconfigured", openaiError: null, updatedAt: new Date() }).where(eq(schema.integrations.accountId, accountId));
}

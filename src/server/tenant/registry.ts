import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { decryptSecret } from "../crypto";
import { env } from "../env";
import { createPgliteExecutor, createPostgresExecutor, tenantPgliteDir, type SqlExecutor } from "./executor";
import { TenantStore } from "./store";
import { TENANT_SCHEMA_V1 } from "./schema-sql";

/** Versão atual do schema do aluno. Ao mudar schema.sql, incremente e adicione uma migração. */
export const TENANT_SCHEMA_VERSION = 1;

/** Scripts por versão: a instalação roda todos os que faltam, em ordem. */
const MIGRATIONS: { version: number; sql: string }[] = [{ version: 1, sql: TENANT_SCHEMA_V1 }];

export class TenantNotConfigured extends Error {
  constructor(msg = "Supabase da conta não configurado.") {
    super(msg);
  }
}

type Entry = { executor: SqlExecutor; store: TenantStore; key: string };
const g = globalThis as unknown as { __tenants?: Map<string, Promise<Entry>> };
const cache = (g.__tenants ??= new Map());

/** Onde está o banco desta conta: URL real ou PGlite local (dev). */
async function resolveTarget(accountId: string): Promise<{ key: string; url?: string; dir?: string }> {
  const db = await getDb();
  const [integ] = await db.select().from(schema.integrations).where(eq(schema.integrations.accountId, accountId)).limit(1);
  if (integ?.supabaseDbUrlEnc) {
    const url = decryptSecret(integ.supabaseDbUrlEnc);
    return { key: `pg:${url}`, url };
  }
  if (env.devSimulator || !env.isProd) {
    const dir = tenantPgliteDir(accountId);
    return { key: `pglite:${dir}`, dir };
  }
  throw new TenantNotConfigured();
}

async function open(target: { key: string; url?: string; dir?: string }): Promise<Entry> {
  const executor = target.url ? await createPostgresExecutor(target.url) : await createPgliteExecutor(target.dir!);
  if (!target.url) {
    // PGlite local: instala/atualiza o schema automaticamente.
    await installSchema(executor);
  }
  return { executor, store: new TenantStore(executor), key: target.key };
}

/** Store do banco do aluno para a conta. Conexões ficam em cache por processo. */
export async function getTenantStore(accountId: string): Promise<TenantStore> {
  const target = await resolveTarget(accountId);
  let p = cache.get(accountId);
  if (p) {
    const entry = await p;
    if (entry.key === target.key) return entry.store;
    cache.delete(accountId);
    entry.executor.close().catch(() => {});
  }
  p = open(target).catch((err) => {
    cache.delete(accountId);
    throw err;
  });
  cache.set(accountId, p);
  return (await p).store;
}

export async function closeTenant(accountId: string): Promise<void> {
  const p = cache.get(accountId);
  if (!p) return;
  cache.delete(accountId);
  const entry = await p.catch(() => null);
  await entry?.executor.close().catch(() => {});
}

export async function currentSchemaVersion(executor: SqlExecutor): Promise<number> {
  try {
    const rows = await executor.query<{ value: string }>(`select value from chatbot.meta where key = 'schema_version'`);
    return Number(rows[0]?.value ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** Instala ou atualiza o schema "chatbot" e devolve a versão final. */
export async function installSchema(executor: SqlExecutor): Promise<number> {
  const current = await currentSchemaVersion(executor);
  for (const m of MIGRATIONS) {
    if (m.version > current) await executor.exec(m.sql);
  }
  return currentSchemaVersion(executor);
}

export type ConnectionTest = {
  ok: boolean;
  error?: string;
  postgresVersion?: string;
  hasVector?: boolean;
  schemaVersion?: number;
};

/** Testa uma string de conexão sem salvar nada. */
export async function testConnection(url: string): Promise<ConnectionTest> {
  let executor: SqlExecutor | null = null;
  try {
    executor = await createPostgresExecutor(url);
    const [{ version }] = await executor.query<{ version: string }>(`select version() as version`);
    const ext = await executor.query<{ n: number | string }>(`select count(*) as n from pg_available_extensions where name = 'vector'`);
    const schemaVersion = await currentSchemaVersion(executor);
    return { ok: true, postgresVersion: version.split(" ").slice(0, 2).join(" "), hasVector: Number(ext[0]?.n ?? 0) > 0, schemaVersion };
  } catch (err) {
    return { ok: false, error: friendlyPgError(err) };
  } finally {
    await executor?.close().catch(() => {});
  }
}

export function friendlyPgError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/password authentication failed/i.test(msg)) return "Senha incorreta. Confira a senha do banco (você pode redefinir em Project Settings → Database).";
  if (/ENOTFOUND|getaddrinfo/i.test(msg)) return "Endereço do servidor não encontrado. Copie a string de conexão inteira do Supabase.";
  if (/ECONNREFUSED|timeout|ETIMEDOUT/i.test(msg)) return "Não foi possível conectar. Verifique host e porta (use o Session pooler, porta 5432).";
  if (/Tenant or user not found/i.test(msg)) return "Usuário do pooler inválido. Copie a string de conexão do tipo Session pooler.";
  if (/does not exist/i.test(msg)) return msg;
  return msg.slice(0, 300);
}

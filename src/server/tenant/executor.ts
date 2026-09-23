import "server-only";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env";

/**
 * Camada mínima de execução SQL, com duas implementações:
 *  - PgliteExecutor: Postgres embutido (dev/testes), um diretório por conta;
 *  - PostgresExecutor: postgres.js contra o Supabase do aluno (produção).
 * O TenantStore escreve SQL uma vez só e roda igual nos dois.
 */
export interface SqlExecutor {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Executa um script com várias instruções (sem parâmetros). */
  exec(script: string): Promise<void>;
  close(): Promise<void>;
  readonly kind: "pglite" | "postgres";
}

export async function createPgliteExecutor(dataDir: string): Promise<SqlExecutor> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  fs.mkdirSync(dataDir, { recursive: true });
  const pg = await PGlite.create({ dataDir, extensions: { vector } });
  return {
    kind: "pglite",
    async query<T>(text: string, params: unknown[] = []) {
      const res = await pg.query<T>(text, params);
      return res.rows;
    },
    async exec(script: string) {
      await pg.exec(script);
    },
    async close() {
      await pg.close();
    },
  };
}

export async function createPostgresExecutor(url: string): Promise<SqlExecutor> {
  const postgres = (await import("postgres")).default;
  const u = new URL(url);
  const host = u.hostname;
  const sslParam = u.searchParams.get("sslmode");
  const ssl = sslParam === "disable" ? false : /supabase\.(co|com)$/.test(host) ? "require" : "prefer";
  const sql = postgres(url, {
    prepare: false, // obrigatório no pooler do Supabase em modo transação
    max: 3,
    idle_timeout: 60,
    connect_timeout: 15,
    ssl: ssl as "require" | "prefer" | false,
    onnotice: () => {},
  });
  return {
    kind: "postgres",
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
    async exec(script: string) {
      await sql.unsafe(script);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

/** Diretório do PGlite "do aluno" em dev: um por conta. */
export function tenantPgliteDir(accountId: string): string {
  return path.join(env.DATA_DIR, "tenants", accountId);
}

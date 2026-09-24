import "server-only";
import path from "node:path";
import fs from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env } from "../env";
import { ensureWritableDir } from "../pglite-dir";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function connectPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = path.join(env.DATA_DIR, "control");
  fs.mkdirSync(dataDir, { recursive: true });
  ensureWritableDir(dataDir);
  const client = await PGlite.create({ dataDir, extensions: { vector } });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

async function connectPostgres(url: string): Promise<Db> {
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { prepare: false, max: 10, idle_timeout: 30, connect_timeout: 15 });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

const g = globalThis as unknown as { __dbPromise?: Promise<Db>; __seedPromise?: Promise<void> };

/**
 * Conexão única (por processo) com o banco do plano de controle, já migrada e
 * com o essencial criado (primeiro super admin, servidor simulado em dev).
 * A carga de demonstração (dev) roda em seguida, sem bloquear.
 */
export function getDb(): Promise<Db> {
  if (!g.__dbPromise) {
    g.__dbPromise = (async () => {
      const db = env.DATABASE_URL ? await connectPostgres(env.DATABASE_URL) : await connectPglite();
      const { bootstrapCore } = await import("./bootstrap");
      await bootstrapCore(db);
      return db;
    })().catch((err) => {
      g.__dbPromise = undefined;
      throw err;
    });
    g.__dbPromise.then(async () => {
      const { seedIfNeeded } = await import("./bootstrap");
      g.__seedPromise = seedIfNeeded().catch((err) => console.error("[seed] falha na carga de demonstração", err));
    });
  }
  return g.__dbPromise;
}

/** Banco pronto E carga de demonstração concluída (use em páginas). */
export async function ensureReady(): Promise<Db> {
  const db = await getDb();
  if (g.__seedPromise) await g.__seedPromise;
  return db;
}

export { schema };

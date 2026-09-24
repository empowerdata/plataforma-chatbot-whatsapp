import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

/**
 * Simula uma instalação de conta única (Docker Compose / render.yaml):
 * NODE_ENV=production, com Evolution embutida já configurada por variáveis
 * de ambiente. DATABASE_URL só precisa existir para passar na validação do
 * env.ts — a conexão de verdade usada no teste é um PGlite direto, sem tocar
 * em nenhum Postgres real.
 */
(process.env as Record<string, string>).NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
process.env.APP_SECRET = "segredo-de-teste-com-mais-de-16-chars";
process.env.DATA_DIR = path.join(os.tmpdir(), "pc-bootstrap-" + process.pid);
process.env.APP_URL = "https://minha-instalacao.onrender.com";
process.env.BOOTSTRAP_ADMIN_EMAIL = "dono@negocio.com";
process.env.BOOTSTRAP_ADMIN_PASSWORD = "senha-do-dono-123";
process.env.BOOTSTRAP_ACCOUNT_NAME = "Pizza Boa Praça";
process.env.EVOLUTION_BUNDLED_HOST = "evolution";
process.env.EVOLUTION_BUNDLED_PORT = "8080";
process.env.EVOLUTION_BUNDLED_API_KEY = "chave-gerada-pelo-render";

describe("bootstrap de instalação de conta única (produção)", () => {
  let db: import("drizzle-orm/pglite").PgliteDatabase<typeof import("@/server/db/schema")>;

  beforeAll(async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const schema = await import("@/server/db/schema");
    const client = await PGlite.create();
    db = drizzle({ client, schema }) as never;
    await migrate(db as never, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  }, 60_000);

  afterAll(() => {
    fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
  });

  it("cria o admin, a conta dele já vinculada, e o servidor Evolution embutido — tudo num único boot", async () => {
    const { bootstrapCore } = await import("@/server/db/bootstrap");
    const schema = await import("@/server/db/schema");
    const { decryptSecret } = await import("@/server/crypto");
    const { eq } = await import("drizzle-orm");

    await bootstrapCore(db as never);

    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("dono@negocio.com");
    expect(users[0].role).toBe("super_admin");
    expect(users[0].accountId).toBeTruthy();
    // Mesma condição usada em src/app/(painel)/layout.tsx para decidir se
    // mostra o menu "Plataforma" (multi-conta): numa instalação de conta
    // única, quem instalou NUNCA deve ser tratado como "administrador da
    // plataforma" — só quem administra várias contas hospedadas por fora.
    const isPlatformAdmin = users[0].role === "super_admin" && !users[0].accountId;
    expect(isPlatformAdmin).toBe(false);

    const accounts = await db.select().from(schema.accounts);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe(users[0].accountId);
    expect(accounts[0].name).toBe("Pizza Boa Praça");

    const integrations = await db.select().from(schema.integrations).where(eq(schema.integrations.accountId, accounts[0].id));
    expect(integrations).toHaveLength(1);

    const nodes = await db.select().from(schema.evolutionNodes);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].baseUrl).toBe("http://evolution:8080");
    expect(decryptSecret(nodes[0].apiKeyEnc)).toBe("chave-gerada-pelo-render");
    expect(nodes[0].kind).toBe("http");
  });

  it("rodar o boot de novo não duplica nada", async () => {
    const { bootstrapCore } = await import("@/server/db/bootstrap");
    const schema = await import("@/server/db/schema");

    await bootstrapCore(db as never);
    await bootstrapCore(db as never);

    expect(await db.select().from(schema.users)).toHaveLength(1);
    expect(await db.select().from(schema.accounts)).toHaveLength(1);
    expect(await db.select().from(schema.evolutionNodes)).toHaveLength(1);
  });
});

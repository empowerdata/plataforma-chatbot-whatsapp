import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "./index";
import * as schema from "./schema";
import { env } from "../env";
import { encryptSecret } from "../crypto";
import { hashPassword } from "../auth/password";
import { slugify } from "@/lib/utils";

/**
 * Cria o que precisa existir antes de qualquer requisição (usa só o `db` recebido).
 * Roda toda vez que o processo sobe; cada passo é idempotente (só age se faltar).
 */
export async function bootstrapCore(db: Db): Promise<void> {
  await ensureBootstrapAdmin(db);
  await ensureOwnAccountForSelfHostedInstall(db);
  await ensureBundledEvolutionNode(db);

  if (env.devSimulator) {
    const [fake] = await db.select({ id: schema.evolutionNodes.id }).from(schema.evolutionNodes).where(eq(schema.evolutionNodes.kind, "fake")).limit(1);
    if (!fake) {
      await db.insert(schema.evolutionNodes).values({
        name: "Evolution simulada (dev)",
        kind: "fake",
        baseUrl: "fake://local",
        apiKeyEnc: encryptSecret("fake"),
        capacity: 100,
        notes: "Servidor de mentira para desenvolver sem VPS. Não existe em produção.",
      });
    }
  }
}

async function ensureBootstrapAdmin(db: Db): Promise<void> {
  const [anyUser] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (anyUser) return;
  await db.insert(schema.users).values({
    email: env.BOOTSTRAP_ADMIN_EMAIL,
    name: "Administrador",
    role: "super_admin",
    passwordHash: await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD),
  });
  console.log(`[bootstrap] super admin criado: ${env.BOOTSTRAP_ADMIN_EMAIL}`);
}

/**
 * Instalação própria do aluno (Docker Compose / render.yaml): o primeiro
 * acesso já cai direto no painel normal, com a conta dele criada e vinculada,
 * sem precisar passar por Admin → Contas primeiro. Só roda em produção — em
 * dev o fluxo de demonstração (seed-demo.ts) já cobre isso via outro usuário.
 * Independente de ensureBootstrapAdmin já ter rodado nesta subida ou numa
 * anterior: sempre reavalia pelo estado atual do banco.
 */
async function ensureOwnAccountForSelfHostedInstall(db: Db): Promise<void> {
  if (!env.isProd) return;
  const [anyAccount] = await db.select({ id: schema.accounts.id }).from(schema.accounts).limit(1);
  if (anyAccount) return;
  const [admin] = await db.select().from(schema.users).where(eq(schema.users.role, "super_admin")).limit(1);
  if (!admin || admin.accountId) return;
  const name = env.BOOTSTRAP_ACCOUNT_NAME?.trim() || "Minha conta";
  const [account] = await db
    .insert(schema.accounts)
    .values({ name, slug: slugify(name) || "conta", plan: { includedNumbers: 5, maxNumbers: 0, maxBots: 0 } })
    .returning();
  await db.insert(schema.integrations).values({ accountId: account.id });
  await db.update(schema.users).set({ accountId: account.id, updatedAt: new Date() }).where(eq(schema.users.id, admin.id));
  console.log(`[bootstrap] conta própria criada para a instalação: ${name}`);
}

/**
 * Servidor Evolution que já vem junto na instalação (mesmo Docker Compose ou
 * mesmo render.yaml do painel). Cadastrado sozinho para o aluno nunca precisar
 * abrir Admin → Servidores numa instalação de conta única.
 */
async function ensureBundledEvolutionNode(db: Db): Promise<void> {
  const { EVOLUTION_BUNDLED_HOST: host, EVOLUTION_BUNDLED_PORT: port, EVOLUTION_BUNDLED_API_KEY: apiKey } = env;
  if (!host || !port || !apiKey) return;
  const baseUrl = `http://${host}:${port}`;
  const [existing] = await db.select({ id: schema.evolutionNodes.id }).from(schema.evolutionNodes).where(eq(schema.evolutionNodes.baseUrl, baseUrl)).limit(1);
  if (existing) return;
  await db.insert(schema.evolutionNodes).values({
    name: "Evolution (nesta instalação)",
    kind: "http",
    baseUrl,
    apiKeyEnc: encryptSecret(apiKey),
    capacity: 30,
    notes: "Cadastrado automaticamente: roda junto com o painel nesta mesma instalação.",
  });
  console.log(`[bootstrap] servidor Evolution embutido cadastrado: ${baseUrl}`);
}

/** Carga de demonstração (só em dev, só quando não há nenhuma conta). */
export async function seedIfNeeded(): Promise<void> {
  if (!env.devSimulator || env.SEED_DEMO !== "1") return;
  const { seedDemo } = await import("./seed-demo");
  await seedDemo();
}

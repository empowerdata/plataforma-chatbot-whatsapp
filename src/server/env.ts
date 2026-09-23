import "server-only";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Configuração por variável de ambiente.
 *
 * Em desenvolvimento nada é obrigatório: sem DATABASE_URL usamos um Postgres
 * embutido (PGlite) em ./.data, e sem APP_SECRET geramos um segredo local e
 * persistimos em ./.data/app-secret para as chaves criptografadas continuarem
 * legíveis entre reinícios.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Postgres do plano de controle. Vazio = PGlite local. */
  DATABASE_URL: z.string().optional(),
  /** Chave-mestra usada para criptografar segredos dos alunos (AES-256-GCM). */
  APP_SECRET: z.string().min(16).optional(),
  /** URL pública da aplicação (usada para montar webhooks e links). */
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Pasta de dados locais (PGlite, segredo dev). */
  DATA_DIR: z.string().default(".data"),
  /** Habilita a Evolution simulada e a página /dev/simulador. */
  DEV_SIMULATOR: z.enum(["0", "1"]).default("1"),
  /** Cria a conta de demonstração em dev quando não há contas. */
  SEED_DEMO: z.enum(["0", "1"]).default("1"),
  /** Token que protege rotas internas (monitor/cron). */
  INTERNAL_TOKEN: z.string().optional(),
  /** Chave OpenAI de fallback só para o ambiente de dev/playground. */
  DEV_OPENAI_API_KEY: z.string().optional(),
  /** E-mail e senha do primeiro super admin (criado na primeira migração). */
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().default("admin@local.test"),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(6).default("admin123"),
});

type Env = z.infer<typeof schema> & { APP_SECRET: string; isProd: boolean; devSimulator: boolean };

function loadSecret(dataDir: string): string {
  const file = path.join(dataDir, "app-secret");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing.length >= 16) return existing;
  } catch {}
  fs.mkdirSync(dataDir, { recursive: true });
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function build(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Variáveis de ambiente inválidas: " + parsed.error.message);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === "production";
  if (isProd && !e.APP_SECRET) throw new Error("APP_SECRET é obrigatório em produção.");
  if (isProd && !e.DATABASE_URL) throw new Error("DATABASE_URL é obrigatório em produção.");
  const dataDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), e.DATA_DIR);
  return {
    ...e,
    DATA_DIR: dataDir,
    APP_SECRET: e.APP_SECRET ?? loadSecret(dataDir),
    isProd,
    devSimulator: e.DEV_SIMULATOR === "1" && !isProd,
  };
}

const g = globalThis as unknown as { __env?: Env };
export const env: Env = g.__env ?? (g.__env = build());

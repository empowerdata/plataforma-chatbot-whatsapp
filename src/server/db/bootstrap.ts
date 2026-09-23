import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "./index";
import * as schema from "./schema";
import { env } from "../env";
import { encryptSecret } from "../crypto";
import { hashPassword } from "../auth/password";

/** Cria o que precisa existir antes de qualquer requisição (usa só o `db` recebido). */
export async function bootstrapCore(db: Db): Promise<void> {
  const [anyUser] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (!anyUser) {
    await db.insert(schema.users).values({
      email: env.BOOTSTRAP_ADMIN_EMAIL,
      name: "Administrador",
      role: "super_admin",
      passwordHash: await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD),
    });
    console.log(`[bootstrap] super admin criado: ${env.BOOTSTRAP_ADMIN_EMAIL}`);
  }

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

/** Carga de demonstração (só em dev, só quando não há nenhuma conta). */
export async function seedIfNeeded(): Promise<void> {
  if (!env.devSimulator || env.SEED_DEMO !== "1") return;
  const { seedDemo } = await import("./seed-demo");
  await seedDemo();
}

import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";

export type EventLevel = "info" | "warn" | "error";

/** Registro de acontecimentos (conexões, erros, avisos) por conta/número. */
export async function logEvent(input: {
  accountId?: string | null;
  numberId?: string | null;
  level?: EventLevel;
  type: string;
  message: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.events).values({
      accountId: input.accountId ?? null,
      numberId: input.numberId ?? null,
      level: input.level ?? "info",
      type: input.type,
      message: input.message.slice(0, 500),
      data: input.data ?? null,
    });
  } catch (err) {
    console.error("[events] falha ao registrar", input.type, err);
  }
  if (input.level === "error") console.error(`[${input.type}] ${input.message}`, input.data ?? "");
}

export async function listEvents(accountId: string, limit = 50) {
  const db = await getDb();
  return db.select().from(schema.events).where(eq(schema.events.accountId, accountId)).orderBy(desc(schema.events.createdAt)).limit(limit);
}

export async function listNumberEvents(numberId: string, limit = 30) {
  const db = await getDb();
  return db.select().from(schema.events).where(eq(schema.events.numberId, numberId)).orderBy(desc(schema.events.createdAt)).limit(limit);
}

export type PlatformEvent = typeof schema.events.$inferSelect & { accountName: string | null };

/** Eventos de todas as contas (visão do super admin), com o nome da conta quando houver. */
export async function listAllEvents(limit = 200, level?: EventLevel): Promise<PlatformEvent[]> {
  const db = await getDb();
  const rows = await db
    .select({ event: schema.events, accountName: schema.accounts.name })
    .from(schema.events)
    .leftJoin(schema.accounts, eq(schema.accounts.id, schema.events.accountId))
    .where(level ? eq(schema.events.level, level) : undefined)
    .orderBy(desc(schema.events.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.event, accountName: r.accountName }));
}

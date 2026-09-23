import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";

export type ClientInput = { name: string; segment?: string | null; contactName?: string | null; contactPhone?: string | null; city?: string | null; notes?: string | null };

export async function listClients(accountId: string) {
  const db = await getDb();
  return db
    .select({
      client: schema.clients,
      numbers: db.$count(schema.numbers, eq(schema.numbers.clientId, schema.clients.id)),
      connected: db.$count(schema.numbers, and(eq(schema.numbers.clientId, schema.clients.id), eq(schema.numbers.status, "open"))),
    })
    .from(schema.clients)
    .where(eq(schema.clients.accountId, accountId))
    .orderBy(desc(schema.clients.createdAt));
}

export async function getClient(accountId: string, id: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.clients).where(and(eq(schema.clients.id, id), eq(schema.clients.accountId, accountId))).limit(1);
  return row ?? null;
}

export async function createClient(accountId: string, input: ClientInput) {
  const db = await getDb();
  const [row] = await db
    .insert(schema.clients)
    .values({ accountId, name: input.name.trim(), segment: input.segment ?? null, contactName: input.contactName ?? null, contactPhone: input.contactPhone?.replace(/\D/g, "") || null, city: input.city ?? null, notes: input.notes ?? null })
    .returning();
  return row;
}

export async function updateClient(accountId: string, id: string, input: Partial<ClientInput> & { isActive?: boolean }) {
  const db = await getDb();
  await db
    .update(schema.clients)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.segment !== undefined ? { segment: input.segment } : {}),
      ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone?.replace(/\D/g, "") || null } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.clients.id, id), eq(schema.clients.accountId, accountId)));
}

export async function deleteClient(accountId: string, id: string) {
  const db = await getDb();
  await db.delete(schema.clients).where(and(eq(schema.clients.id, id), eq(schema.clients.accountId, accountId)));
}

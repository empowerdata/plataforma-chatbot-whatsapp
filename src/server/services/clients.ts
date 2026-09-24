import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { createPasswordSetupLink, setUserActive } from "./accounts";

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

// -------------------------------------------------------- acesso do cliente (portal)

export type ClientPortalUser = { id: string; name: string; email: string; isActive: boolean; lastLoginAt: Date | null };

/** Um login de portal por cliente, indexado por client_id — para a lista de Clientes. */
export async function listClientPortalUsers(accountId: string): Promise<Record<string, ClientPortalUser>> {
  const db = await getDb();
  const rows = await db.select().from(schema.users).where(and(eq(schema.users.accountId, accountId), eq(schema.users.role, "client")));
  const map: Record<string, ClientPortalUser> = {};
  for (const u of rows) {
    if (u.clientId) map[u.clientId] = { id: u.id, name: u.name, email: u.email, isActive: u.isActive, lastLoginAt: u.lastLoginAt };
  }
  return map;
}

/** Cria o login do cliente final (portal), escopado a este client_id; devolve o link para definir senha. */
export async function createClientPortalUser(accountId: string, clientId: string, input: { name: string; email: string }): Promise<{ userId: string; setupLink: string }> {
  const client = await getClient(accountId, clientId);
  if (!client) throw new Error("Cliente não encontrado.");
  const db = await getDb();
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  if (existing) throw new Error("Já existe um usuário com este e-mail.");
  const [user] = await db.insert(schema.users).values({ accountId, clientId, name: input.name.trim(), email, role: "client" }).returning();
  return { userId: user.id, setupLink: await createPasswordSetupLink(user.id) };
}

/** Ativa/desativa o acesso do cliente ao portal (nunca mexe em usuário de outra conta). */
export async function setClientPortalUserActive(accountId: string, userId: string, active: boolean): Promise<void> {
  const db = await getDb();
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), eq(schema.users.accountId, accountId), eq(schema.users.role, "client")))
    .limit(1);
  if (!user) throw new Error("Acesso não encontrado.");
  await setUserActive(userId, active);
}

/** Novo link de "definir senha" para um acesso de portal já existente. */
export async function newClientPortalSetupLink(accountId: string, userId: string): Promise<string> {
  const db = await getDb();
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), eq(schema.users.accountId, accountId), eq(schema.users.role, "client")))
    .limit(1);
  if (!user) throw new Error("Acesso não encontrado.");
  return createPasswordSetupLink(userId);
}

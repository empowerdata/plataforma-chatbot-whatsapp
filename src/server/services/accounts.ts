import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { AccountPlan } from "../db/schema";
import { hashPassword } from "../auth/password";
import { randomToken, sha256 } from "../crypto";
import { slugify } from "@/lib/utils";
import { env } from "../env";

export type AccountSummary = {
  account: typeof schema.accounts.$inferSelect;
  numbers: number;
  bots: number;
  users: number;
  supabaseStatus: string;
  openaiStatus: string;
};

export async function listAccounts(): Promise<AccountSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      account: schema.accounts,
      numbers: db.$count(schema.numbers, eq(schema.numbers.accountId, schema.accounts.id)),
      bots: db.$count(schema.bots, eq(schema.bots.accountId, schema.accounts.id)),
      users: db.$count(schema.users, eq(schema.users.accountId, schema.accounts.id)),
      supabaseStatus: sql<string>`coalesce(${schema.integrations.supabaseStatus}::text, 'unconfigured')`,
      openaiStatus: sql<string>`coalesce(${schema.integrations.openaiStatus}::text, 'unconfigured')`,
    })
    .from(schema.accounts)
    .leftJoin(schema.integrations, eq(schema.integrations.accountId, schema.accounts.id))
    .orderBy(desc(schema.accounts.createdAt));
  return rows;
}

export async function getAccount(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).limit(1);
  return row ?? null;
}

async function uniqueSlug(base: string): Promise<string> {
  const db = await getDb();
  let slug = slugify(base) || "conta";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const [exists] = await db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.slug, candidate)).limit(1);
    if (!exists) return candidate;
  }
  return `${slug}-${randomToken(3)}`;
}

export type CreateAccountInput = {
  name: string;
  adminName: string;
  adminEmail: string;
  plan?: Partial<AccountPlan>;
  notes?: string;
  expiresAt?: Date | null;
};

/** Cria a conta do aluno e o primeiro usuário; devolve o link para definir senha. */
export async function createAccount(input: CreateAccountInput): Promise<{ accountId: string; userId: string; setupLink: string }> {
  const db = await getDb();
  const email = input.adminEmail.trim().toLowerCase();
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  if (existing) throw new Error("Já existe um usuário com este e-mail.");
  const slug = await uniqueSlug(input.name);
  const [account] = await db
    .insert(schema.accounts)
    .values({
      name: input.name.trim(),
      slug,
      plan: { includedNumbers: 3, maxNumbers: 0, maxBots: 0, ...(input.plan ?? {}) },
      notes: input.notes ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  await db.insert(schema.integrations).values({ accountId: account.id });
  const [user] = await db.insert(schema.users).values({ accountId: account.id, name: input.adminName.trim(), email, role: "member" }).returning();
  const setupLink = await createPasswordSetupLink(user.id);
  return { accountId: account.id, userId: user.id, setupLink };
}

export async function updateAccount(id: string, patch: { name?: string; plan?: AccountPlan; notes?: string | null; expiresAt?: Date | null; status?: "active" | "suspended"; branding?: { productName?: string; logoUrl?: string } }) {
  const db = await getDb();
  await db.update(schema.accounts).set({ ...patch, updatedAt: new Date() }).where(eq(schema.accounts.id, id));
}

export async function listAccountUsers(accountId: string) {
  const db = await getDb();
  return db.select().from(schema.users).where(eq(schema.users.accountId, accountId)).orderBy(schema.users.createdAt);
}

export async function createAccountUser(input: { accountId: string; name: string; email: string }): Promise<{ userId: string; setupLink: string }> {
  const db = await getDb();
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  if (existing) throw new Error("Já existe um usuário com este e-mail.");
  const [user] = await db.insert(schema.users).values({ accountId: input.accountId, name: input.name.trim(), email, role: "member" }).returning();
  return { userId: user.id, setupLink: await createPasswordSetupLink(user.id) };
}

export async function setUserActive(userId: string, active: boolean) {
  const db = await getDb();
  await db.update(schema.users).set({ isActive: active, updatedAt: new Date() }).where(eq(schema.users.id, userId));
  if (!active) await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

/** Link de uso único (7 dias) para o usuário definir/redefinir a senha. */
export async function createPasswordSetupLink(userId: string): Promise<string> {
  const db = await getDb();
  const token = randomToken(32);
  await db.insert(schema.passwordTokens).values({ id: sha256(token), userId, expiresAt: new Date(Date.now() + 7 * 86400_000) });
  return `${env.APP_URL}/definir-senha/${token}`;
}

export async function getPasswordTokenUser(token: string) {
  const db = await getDb();
  const rows = await db
    .select({ token: schema.passwordTokens, user: schema.users })
    .from(schema.passwordTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.passwordTokens.userId))
    .where(eq(schema.passwordTokens.id, sha256(token)))
    .limit(1);
  const row = rows[0];
  if (!row || row.token.usedAt || row.token.expiresAt < new Date()) return null;
  return row.user;
}

export async function consumePasswordToken(token: string, password: string): Promise<{ userId: string } | null> {
  const user = await getPasswordTokenUser(token);
  if (!user) return null;
  const db = await getDb();
  await db.update(schema.users).set({ passwordHash: await hashPassword(password), isActive: true, updatedAt: new Date() }).where(eq(schema.users.id, user.id));
  await db.update(schema.passwordTokens).set({ usedAt: new Date() }).where(and(eq(schema.passwordTokens.id, sha256(token))));
  return { userId: user.id };
}

export async function countAccountNumbers(accountId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ n: count() }).from(schema.numbers).where(eq(schema.numbers.accountId, accountId));
  return Number(row?.n ?? 0);
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSuperAdminOrThrow } from "@/server/auth/guards";
import { setActAsAccount } from "@/server/auth/session";
import { createAccount, createAccountUser, createPasswordSetupLink, listAccountUsers, setUserActive, updateAccount } from "@/server/services/accounts";

type Result<T = undefined> = { error: string | null; data?: T };

function fail(err: unknown): Result<never> {
  return { error: err instanceof Error ? err.message : String(err) };
}

export async function actAsAccountAction(accountId: string): Promise<void> {
  await getSuperAdminOrThrow();
  await setActAsAccount(accountId);
  redirect("/");
}

export async function stopActingAction(): Promise<void> {
  await getSuperAdminOrThrow();
  await setActAsAccount(null);
  redirect("/admin/contas");
}

const createSchema = z.object({
  name: z.string().min(2, "Nome da conta muito curto."),
  adminName: z.string().min(2, "Nome do responsável muito curto."),
  adminEmail: z.string().email("E-mail inválido."),
  includedNumbers: z.coerce.number().int().min(0).default(3),
  maxNumbers: z.coerce.number().int().min(0).default(0),
  notes: z.string().optional(),
});

export async function createAccountAction(input: z.input<typeof createSchema>): Promise<Result<{ accountId: string; setupLink: string }>> {
  try {
    await getSuperAdminOrThrow();
    const data = createSchema.parse(input);
    const res = await createAccount({ name: data.name, adminName: data.adminName, adminEmail: data.adminEmail, plan: { includedNumbers: data.includedNumbers, maxNumbers: data.maxNumbers, maxBots: 0 }, notes: data.notes });
    revalidatePath("/admin/contas");
    return { error: null, data: { accountId: res.accountId, setupLink: res.setupLink } };
  } catch (err) {
    return fail(err);
  }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  includedNumbers: z.coerce.number().int().min(0).optional(),
  maxNumbers: z.coerce.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
  productName: z.string().max(60).optional(),
});

export async function updateAccountAction(input: z.input<typeof updateSchema>): Promise<Result> {
  try {
    await getSuperAdminOrThrow();
    const d = updateSchema.parse(input);
    await updateAccount(d.id, {
      name: d.name,
      status: d.status,
      notes: d.notes,
      ...(d.includedNumbers !== undefined || d.maxNumbers !== undefined ? { plan: { includedNumbers: d.includedNumbers ?? 3, maxNumbers: d.maxNumbers ?? 0, maxBots: 0 } } : {}),
      ...(d.productName !== undefined ? { branding: { productName: d.productName } } : {}),
    });
    revalidatePath("/admin/contas");
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

export async function createUserAction(input: { accountId: string; name: string; email: string }): Promise<Result<{ setupLink: string }>> {
  try {
    await getSuperAdminOrThrow();
    const res = await createAccountUser(input);
    revalidatePath("/admin/contas");
    return { error: null, data: { setupLink: res.setupLink } };
  } catch (err) {
    return fail(err);
  }
}

export async function newSetupLinkAction(userId: string): Promise<Result<{ setupLink: string }>> {
  try {
    await getSuperAdminOrThrow();
    return { error: null, data: { setupLink: await createPasswordSetupLink(userId) } };
  } catch (err) {
    return fail(err);
  }
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<Result> {
  try {
    await getSuperAdminOrThrow();
    await setUserActive(userId, active);
    revalidatePath("/admin/contas");
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

/** Usuário de uma conta, já sem campos sensíveis (nunca mandar passwordHash ao navegador). */
export type AccountUserItem = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export async function listAccountUsersAction(accountId: string): Promise<Result<AccountUserItem[]>> {
  try {
    await getSuperAdminOrThrow();
    const users = await listAccountUsers(accountId);
    return {
      error: null,
      data: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    return fail(err);
  }
}

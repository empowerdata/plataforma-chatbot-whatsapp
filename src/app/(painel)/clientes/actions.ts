"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAccountOrThrow } from "@/server/auth/guards";
import { createClient, createClientPortalUser, deleteClient, newClientPortalSetupLink, setClientPortalUserActive, updateClient } from "@/server/services/clients";

type Result<T = undefined> = { error: string | null; data?: T };

function fail(err: unknown): Result<never> {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
  return { error: err instanceof Error ? err.message : String(err) };
}

const clientSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao cliente, por exemplo o nome do negócio."),
  segment: z.string().trim().max(80).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactPhone: z.string().optional(),
  city: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function createClientAction(input: z.input<typeof clientSchema>): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    const d = clientSchema.parse(input);
    await createClient(account.id, {
      name: d.name,
      segment: d.segment || null,
      contactName: d.contactName || null,
      contactPhone: d.contactPhone || null,
      city: d.city || null,
      notes: d.notes || null,
    });
    revalidatePath("/clientes");
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

const updateSchema = clientSchema.partial();

export async function updateClientAction(id: string, patch: z.input<typeof updateSchema>): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    const d = updateSchema.parse(patch);
    await updateClient(account.id, id, {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.segment !== undefined ? { segment: d.segment || null } : {}),
      ...(d.contactName !== undefined ? { contactName: d.contactName || null } : {}),
      ...(d.contactPhone !== undefined ? { contactPhone: d.contactPhone || null } : {}),
      ...(d.city !== undefined ? { city: d.city || null } : {}),
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
    });
    revalidatePath("/clientes");
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteClientAction(id: string): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    await deleteClient(account.id, id);
    revalidatePath("/clientes");
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

const portalAccessSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome de quem vai acessar."),
  email: z.string().trim().email("E-mail inválido."),
});

/** Cria o login do portal do cliente final; devolve o link para definir senha. */
export async function grantPortalAccessAction(clientId: string, input: z.input<typeof portalAccessSchema>): Promise<Result<{ setupLink: string }>> {
  try {
    const { account } = await getAccountOrThrow();
    const d = portalAccessSchema.parse(input);
    const res = await createClientPortalUser(account.id, clientId, d);
    revalidatePath("/clientes");
    return { error: null, data: { setupLink: res.setupLink } };
  } catch (err) {
    return fail(err);
  }
}

export async function setPortalAccessActiveAction(userId: string, active: boolean): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    await setClientPortalUserActive(account.id, userId, active);
    revalidatePath("/clientes");
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

export async function newPortalSetupLinkAction(userId: string): Promise<Result<{ setupLink: string }>> {
  try {
    const { account } = await getAccountOrThrow();
    const setupLink = await newClientPortalSetupLink(account.id, userId);
    return { error: null, data: { setupLink } };
  } catch (err) {
    return fail(err);
  }
}

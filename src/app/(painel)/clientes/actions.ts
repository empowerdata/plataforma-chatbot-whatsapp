"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAccountOrThrow } from "@/server/auth/guards";
import { createClient, deleteClient, updateClient } from "@/server/services/clients";

type Result = { error: string | null };

function fail(err: unknown): Result {
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

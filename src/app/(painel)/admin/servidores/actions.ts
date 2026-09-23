"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSuperAdminOrThrow } from "@/server/auth/guards";
import { checkNode, createNode, deleteNode, updateNode, type NodeHealth } from "@/server/services/nodes";

type Result<T = undefined> = { error: string | null; data?: T };

function fail(err: unknown): Result<never> {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
  return { error: err instanceof Error ? err.message : String(err) };
}

const createSchema = z.object({
  name: z.string().min(2, "Dê um nome ao servidor."),
  baseUrl: z.string().min(1, "Informe a URL do servidor."),
  apiKey: z.string().min(1, "Informe a chave da API."),
  capacity: z.coerce.number().int().min(0).default(40),
  notes: z.string().optional(),
});

export async function createNodeAction(input: z.input<typeof createSchema>): Promise<Result<{ id: string; health: NodeHealth }>> {
  try {
    await getSuperAdminOrThrow();
    const d = createSchema.parse(input);
    const { node, health } = await createNode({ name: d.name, baseUrl: d.baseUrl, apiKey: d.apiKey, capacity: d.capacity, notes: d.notes });
    revalidatePath("/admin/servidores");
    return { error: null, data: { id: node.id, health } };
  } catch (err) {
    return fail(err);
  }
}

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  baseUrl: z.string().min(1).optional(),
  apiKey: z.string().optional(),
  capacity: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export async function updateNodeAction(id: string, patch: z.input<typeof updateSchema>): Promise<Result> {
  try {
    await getSuperAdminOrThrow();
    const d = updateSchema.parse(patch);
    await updateNode(id, d);
    revalidatePath("/admin/servidores");
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteNodeAction(id: string): Promise<Result> {
  try {
    await getSuperAdminOrThrow();
    await deleteNode(id);
    revalidatePath("/admin/servidores");
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

export async function checkNodeAction(id: string): Promise<Result<NodeHealth>> {
  try {
    await getSuperAdminOrThrow();
    const health = await checkNode(id);
    revalidatePath("/admin/servidores");
    return { error: null, data: health };
  } catch (err) {
    return fail(err);
  }
}

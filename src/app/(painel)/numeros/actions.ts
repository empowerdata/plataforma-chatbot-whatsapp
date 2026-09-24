"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAccountOrThrow } from "@/server/auth/guards";
import { getClient } from "@/server/services/clients";
import { assignBot, createNumber, deleteNumber, disconnectNumber, reconnectNumber, updateNumber } from "@/server/services/numbers";
import { numberSettingsSchema } from "@/shared/number-settings";

type Result<T = undefined> = { error: string | null; data?: T };

function fail(err: unknown): Result<never> {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
  return { error: err instanceof Error ? err.message : String(err) };
}

function revalidate(id?: string) {
  revalidatePath("/numeros");
  if (id) revalidatePath(`/numeros/${id}`);
}

/** Só dígitos; número brasileiro sem DDI (10–11 dígitos) ganha o 55 na frente. */
function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

/** Garante que o cliente informado pertence à conta. Todo número tem cliente (ver docs/visao-e-decisoes.md). */
async function ensureClient(accountId: string, clientId: string): Promise<void> {
  const client = await getClient(accountId, clientId);
  if (!client) throw new Error("Cliente não encontrado.");
}

const createSchema = z.object({
  label: z.string().trim().min(2, "Dê um nome ao número, por exemplo o nome do negócio."),
  clientId: z.string({ message: "Escolha o cliente deste número." }).min(1, "Escolha o cliente deste número."),
  pairingPhone: z.string().optional(),
});

export async function createNumberAction(input: z.input<typeof createSchema>): Promise<Result<{ id: string }>> {
  try {
    const { account } = await getAccountOrThrow();
    const d = createSchema.parse(input);
    await ensureClient(account.id, d.clientId);
    const pairingPhone = normalizePhone(d.pairingPhone);
    if (pairingPhone && pairingPhone.length < 12) throw new Error("Telefone para pareamento incompleto. Use DDD + número, só dígitos.");
    const row = await createNumber({ accountId: account.id, label: d.label, clientId: d.clientId, pairingPhone });
    revalidate(row.id);
    return { error: null, data: { id: row.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function reconnectNumberAction(id: string): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    await reconnectNumber(account.id, id);
    revalidate(id);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

export async function disconnectNumberAction(id: string): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    await disconnectNumber(account.id, id);
    revalidate(id);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteNumberAction(id: string): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    await deleteNumber(account.id, id);
    revalidate(id);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

const updateSchema = z.object({
  label: z.string().trim().min(2, "O nome do número precisa ter pelo menos 2 letras.").optional(),
  clientId: z.string().min(1, "Todo número precisa de um cliente.").optional(),
  variables: z.record(z.string().regex(/^[\w.-]+$/, "Nome de variável inválido: use só letras, números, _ ou -, sem espaços."), z.string().max(2000, "Valor de variável muito longo.")).optional(),
  settings: numberSettingsSchema.optional(),
  botEnabled: z.boolean().optional(),
});

export async function updateNumberAction(id: string, patch: z.input<typeof updateSchema>): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    const d = updateSchema.parse(patch);
    if (d.clientId !== undefined) await ensureClient(account.id, d.clientId);
    await updateNumber(account.id, id, { label: d.label, clientId: d.clientId, variables: d.variables, settings: d.settings, botEnabled: d.botEnabled });
    revalidate(id);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

export async function assignBotAction(id: string, botId: string | null): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    await assignBot(account.id, id, botId || null);
    revalidate(id);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

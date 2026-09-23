"use server";

import { revalidatePath } from "next/cache";
import { getAccountOrThrow } from "@/server/auth/guards";
import { CHAT_MODEL_OPTIONS } from "@/server/ai/provider";
import { recheckOpenAi, recheckSupabase, removeOpenAi, removeSupabase, saveOpenAiKey, saveSupabaseUrl, setOpenAiModel } from "@/server/services/integrations";

type Result = { error: string | null };

function fail(err: unknown): Result {
  return { error: err instanceof Error ? err.message : String(err) };
}

function fromService(res: { ok: boolean; error?: string }, fallback: string): Result {
  return res.ok ? { error: null } : { error: res.error || fallback };
}

function revalidate(): void {
  revalidatePath("/integracoes");
  revalidatePath("/");
}

function isKnownModel(model: unknown): model is string {
  return typeof model === "string" && CHAT_MODEL_OPTIONS.some((m) => m.id === model);
}

// ---------------------------------------------------------------- Supabase

export async function saveSupabaseUrlAction(url: string): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    if (typeof url !== "string" || !url.trim()) return { error: "Cole a string de conexão do seu projeto Supabase." };
    const res = await saveSupabaseUrl(account.id, url);
    revalidate(); // status/erro mudam mesmo quando falha
    return fromService(res, "Não foi possível conectar ao Supabase. Confira a string e tente de novo.");
  } catch (err) {
    return fail(err);
  }
}

/** Testa a conexão e instala atualizações pendentes das tabelas. */
export async function recheckSupabaseAction(): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    const res = await recheckSupabase(account.id);
    revalidate();
    return fromService(res, "Não foi possível verificar a conexão com o Supabase.");
  } catch (err) {
    return fail(err);
  }
}

export async function removeSupabaseAction(): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    await removeSupabase(account.id);
    revalidate();
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------- OpenAI

export async function saveOpenAiKeyAction(key: string, model: string): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    if (typeof key !== "string" || !key.trim()) return { error: "Cole a chave da API da OpenAI." };
    if (model && !isKnownModel(model)) return { error: "Escolha um modelo da lista." };
    const res = await saveOpenAiKey(account.id, key, model || undefined);
    revalidate();
    return fromService(res, "Não foi possível validar a chave. Tente de novo.");
  } catch (err) {
    return fail(err);
  }
}

export async function recheckOpenAiAction(): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    const res = await recheckOpenAi(account.id);
    revalidate();
    return fromService(res, "Não foi possível verificar a chave.");
  } catch (err) {
    return fail(err);
  }
}

export async function setOpenAiModelAction(model: string): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    if (!isKnownModel(model)) return { error: "Escolha um modelo da lista." };
    await setOpenAiModel(account.id, model);
    revalidate();
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

export async function removeOpenAiAction(): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    await removeOpenAi(account.id);
    revalidate();
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { getAccountOrThrow } from "@/server/auth/guards";
import { resolveConversation, setBotPausedForContact, setContactBlocked, setConversationCategory, setConversationResolved } from "@/server/services/conversations";
import { TenantNotConfigured } from "@/server/tenant";

type Result = { error: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(err: unknown): Result {
  if (err instanceof TenantNotConfigured) return { error: "Conecte o Supabase da conta em Integrações para gerenciar as conversas." };
  return { error: err instanceof Error ? err.message : String(err) };
}

function assertId(id: string): void {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw new Error("Conversa não encontrada.");
}

function revalidate(id: string): void {
  revalidatePath("/conversas");
  revalidatePath(`/conversas/${id}`);
}

/** Libera o bot: a conversa volta a "aberta", sem pedido de humano, e o contato deixa de estar pausado. */
export async function resolveConversationAction(id: string): Promise<Result> {
  try {
    assertId(id);
    const { account } = await getAccountOrThrow();
    await resolveConversation(account.id, id);
    revalidate(id);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

/** Pausa o bot para o contato desta conversa por `hours` horas; `null` retoma o bot agora. */
export async function pauseBotAction(id: string, hours: number | null): Promise<Result> {
  try {
    assertId(id);
    if (hours !== null && (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30)) throw new Error("Escolha entre 1 hora e 30 dias.");
    const { account } = await getAccountOrThrow();
    await setBotPausedForContact(account.id, id, hours);
    revalidate(id);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

/** Bloqueia (ou desbloqueia) o contato desta conversa. */
export async function blockContactAction(id: string, blocked: boolean): Promise<Result> {
  try {
    assertId(id);
    const { account } = await getAccountOrThrow();
    await setContactBlocked(account.id, id, blocked === true);
    revalidate(id);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

/** Corrige a categoria na mão; `null` limpa (volta para "sem categoria"). */
export async function setCategoryAction(id: string, category: string | null): Promise<Result> {
  try {
    assertId(id);
    const { account } = await getAccountOrThrow();
    await setConversationCategory(account.id, id, category && category.trim() ? category.trim().slice(0, 40) : null);
    revalidate(id);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

/** Marca a conversa como finalizada (ou reabre) — gestão de CRM, independente do bot. */
export async function setResolvedAction(id: string, resolved: boolean): Promise<Result> {
  try {
    assertId(id);
    const { account } = await getAccountOrThrow();
    await setConversationResolved(account.id, id, resolved);
    revalidate(id);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

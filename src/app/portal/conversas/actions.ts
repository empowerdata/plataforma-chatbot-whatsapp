"use server";

import { revalidatePath } from "next/cache";
import { getClientAccessOrThrow } from "@/server/auth/guards";
import { setPortalConversationCategory, setPortalConversationResolved } from "@/server/services/portal";
import { TenantNotConfigured } from "@/server/tenant";

type Result = { error: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(err: unknown): Result {
  if (err instanceof TenantNotConfigured) return { error: "Atendimento ainda não disponível." };
  return { error: err instanceof Error ? err.message : String(err) };
}

function assertId(id: string): void {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw new Error("Conversa não encontrada.");
}

function revalidate(id: string): void {
  revalidatePath("/portal/conversas");
  revalidatePath(`/portal/conversas/${id}`);
  revalidatePath("/portal");
}

export async function setPortalCategoryAction(id: string, category: string | null): Promise<Result> {
  try {
    assertId(id);
    const { client } = await getClientAccessOrThrow();
    await setPortalConversationCategory(client.accountId, client.id, id, category && category.trim() ? category.trim().slice(0, 40) : null);
    revalidate(id);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

export async function setPortalResolvedAction(id: string, resolved: boolean): Promise<Result> {
  try {
    assertId(id);
    const { client } = await getClientAccessOrThrow();
    await setPortalConversationResolved(client.accountId, client.id, id, resolved);
    revalidate(id);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

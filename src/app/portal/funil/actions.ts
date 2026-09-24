"use server";

import { revalidatePath } from "next/cache";
import { getClientAccessOrThrow } from "@/server/auth/guards";
import { completeNextAction, deleteLead, moveLeadTo, sanitizeLeadPatch, sanitizeMoveExtras, sanitizeStages, saveStages, updateLeadFields, type CrmScope } from "@/server/services/crm";
import { TenantNotConfigured } from "@/server/tenant";
import type { CrmResult } from "@/components/crm/types";

/** O cliente vem sempre da sessão (client_id do login), nunca do navegador. */
async function run(fn: (scope: CrmScope, actor: string) => Promise<void>): Promise<CrmResult> {
  try {
    const { client, user } = await getClientAccessOrThrow();
    await fn({ accountId: client.accountId, clientId: client.id, staff: false }, user.name);
    revalidatePath("/portal", "layout");
    return { error: null };
  } catch (err) {
    if (err instanceof TenantNotConfigured) return { error: "Atendimento ainda não disponível." };
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function moveLeadAction(leadId: string, stageId: string, extras: unknown) {
  return run((s, actor) => moveLeadTo(s, String(leadId), String(stageId), sanitizeMoveExtras(extras), actor));
}

export async function updateLeadAction(leadId: string, patch: unknown) {
  return run((s, actor) => updateLeadFields(s, String(leadId), sanitizeLeadPatch(patch), actor));
}

export async function completeNextActionAction(leadId: string) {
  return run((s, actor) => completeNextAction(s, String(leadId), actor));
}

export async function saveStagesAction(stages: unknown) {
  return run((s) => saveStages(s, sanitizeStages(stages)));
}

export async function deleteLeadAction(leadId: string) {
  return run((s) => deleteLead(s, String(leadId)));
}

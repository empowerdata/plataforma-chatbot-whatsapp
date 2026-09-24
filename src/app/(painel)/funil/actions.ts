"use server";

import { revalidatePath } from "next/cache";
import { getAccountOrThrow } from "@/server/auth/guards";
import { completeNextAction, deleteLead, moveLeadTo, sanitizeLeadPatch, sanitizeMoveExtras, sanitizeStages, saveStages, updateLeadFields, type CrmScope } from "@/server/services/crm";
import { TenantNotConfigured } from "@/server/tenant";
import type { CrmResult } from "@/components/crm/types";

/**
 * Ações da equipe no funil de um cliente. O `clientId` vem preso pela página
 * (bind) e o serviço confere que o cliente é desta conta.
 */
async function run(clientId: string, fn: (scope: CrmScope, actor: string) => Promise<void>): Promise<CrmResult> {
  try {
    const { account, user } = await getAccountOrThrow();
    await fn({ accountId: account.id, clientId: String(clientId), staff: true }, user.name);
    revalidatePath("/funil");
    revalidatePath("/hoje");
    return { error: null };
  } catch (err) {
    if (err instanceof TenantNotConfigured) return { error: "Configure o banco de dados das conversas em Integrações." };
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function moveLeadAction(clientId: string, leadId: string, stageId: string, extras: unknown) {
  return run(clientId, (s, actor) => moveLeadTo(s, String(leadId), String(stageId), sanitizeMoveExtras(extras), actor));
}

export async function updateLeadAction(clientId: string, leadId: string, patch: unknown) {
  return run(clientId, (s, actor) => updateLeadFields(s, String(leadId), sanitizeLeadPatch(patch), actor));
}

export async function completeNextActionAction(clientId: string, leadId: string) {
  return run(clientId, (s, actor) => completeNextAction(s, String(leadId), actor));
}

export async function saveStagesAction(clientId: string, stages: unknown) {
  return run(clientId, (s) => saveStages(s, sanitizeStages(stages)));
}

export async function deleteLeadAction(clientId: string, leadId: string) {
  return run(clientId, (s) => deleteLead(s, String(leadId)));
}

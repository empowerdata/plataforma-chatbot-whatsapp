"use server";

import { revalidatePath } from "next/cache";
import { getAccountOrThrow } from "@/server/auth/guards";
import { renameInboxContact, saveInboxNotes, sendInboxMessage, setInboxBlocked, setInboxBot, setInboxCategory, setInboxLeadStage, setInboxResolved, type InboxScope } from "@/server/services/inbox";
import { TenantNotConfigured } from "@/server/tenant";
import type { ActionResult } from "@/components/inbox/types";

async function run(fn: (scope: InboxScope, author: string) => Promise<void>): Promise<ActionResult> {
  try {
    const { account, user } = await getAccountOrThrow();
    await fn({ accountId: account.id, clientId: null, staff: true }, user.name);
    revalidatePath("/conversas");
    return { error: null };
  } catch (err) {
    if (err instanceof TenantNotConfigured) return { error: "Configure o banco de dados das conversas em Integrações." };
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function setResolvedAction(id: string, resolved: boolean) {
  return run((s) => setInboxResolved(s, id, resolved === true));
}

export async function setCategoryAction(id: string, category: string | null) {
  return run((s) => setInboxCategory(s, id, typeof category === "string" ? category : null));
}

export async function setBotAction(id: string, enabled: boolean) {
  return run((s) => setInboxBot(s, id, enabled === true));
}

export async function sendMessageAction(id: string, text: string) {
  return run((s, author) => sendInboxMessage(s, id, String(text ?? ""), author));
}

export async function saveNotesAction(id: string, notes: string) {
  return run((s) => saveInboxNotes(s, id, String(notes ?? "")));
}

export async function renameContactAction(id: string, name: string) {
  return run((s) => renameInboxContact(s, id, String(name ?? "")));
}

export async function setBlockedAction(id: string, blocked: boolean) {
  return run((s) => setInboxBlocked(s, id, blocked === true));
}

export async function setStageAction(id: string, stageId: string, extras: { appointmentAt?: string; lostReason?: string }) {
  return run((s, author) => setInboxLeadStage(s, id, String(stageId ?? ""), { appointmentAt: typeof extras?.appointmentAt === "string" ? extras.appointmentAt : undefined, lostReason: typeof extras?.lostReason === "string" ? extras.lostReason : undefined }, author));
}

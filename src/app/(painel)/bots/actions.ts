"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getAccountOrThrow } from "@/server/auth/guards";
import { createBot, deleteBot, duplicateBot, getBot, publishBot, updateBot } from "@/server/services/bots";
import { addFaqItem, addFileItem, addTextItem, addUrlItem, deleteItem, getItem, reindexItem, updateItem } from "@/server/services/knowledge";
import type { BotConfigInput } from "@/shared/bot-config";

type Result<T = undefined> = { error: string | null; data?: T };

const MAX_UPLOAD_BYTES = 1024 * 1024;

function fail(err: unknown): Result<never> {
  if (err instanceof ZodError) {
    const issues = err.issues.slice(0, 3).map((i) => `${i.path.join(".") || "config"}: ${i.message}`);
    return { error: `Configuração inválida — ${issues.join("; ")}` };
  }
  return { error: err instanceof Error ? err.message : String(err) };
}

function revalidateBot(id?: string) {
  revalidatePath("/bots");
  if (id) revalidatePath(`/bots/${id}`);
}

// ---------------------------------------------------------------- Bots

export async function createBotAction(input: { name: string; templateKey?: string | null; businessName?: string }): Promise<Result<{ id: string }>> {
  try {
    const { account } = await getAccountOrThrow();
    const name = input.name.trim();
    if (name.length < 2) return { error: "Dê um nome ao bot (pelo menos 2 letras)." };
    const businessName = input.businessName?.trim() ?? "";
    if (!businessName) return { error: "Informe o nome do negócio." };
    const bot = await createBot({ accountId: account.id, name, templateKey: input.templateKey ?? null, businessName });
    revalidateBot();
    return { error: null, data: { id: bot.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateBotAction(id: string, patch: { name?: string; config?: BotConfigInput; isActive?: boolean }): Promise<Result<{ version: number }>> {
  try {
    const { account } = await getAccountOrThrow();
    if (patch.name !== undefined && patch.name.trim().length < 2) return { error: "O nome do bot precisa ter pelo menos 2 letras." };
    const bot = await updateBot(account.id, id, patch);
    revalidateBot(id);
    return { error: null, data: { version: bot.version } };
  } catch (err) {
    return fail(err);
  }
}

export async function publishBotAction(id: string): Promise<Result<{ version: number }>> {
  try {
    const { account } = await getAccountOrThrow();
    const bot = await getBot(account.id, id);
    if (!bot) return { error: "Bot não encontrado." };
    await publishBot(account.id, id);
    revalidateBot(id);
    return { error: null, data: { version: bot.version + 1 } };
  } catch (err) {
    return fail(err);
  }
}

export async function duplicateBotAction(id: string): Promise<Result<{ id: string }>> {
  try {
    const { account } = await getAccountOrThrow();
    const copy = await duplicateBot(account.id, id);
    revalidateBot();
    return { error: null, data: { id: copy.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteBotAction(id: string): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    await deleteBot(account.id, id);
    revalidateBot(id);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------- Base de conhecimento

export async function addTextItemAction(botId: string, input: { title: string; content: string }): Promise<Result<{ id: string }>> {
  try {
    const { account } = await getAccountOrThrow();
    const item = await addTextItem({ accountId: account.id, botId, title: input.title, content: input.content });
    revalidateBot(botId);
    return { error: null, data: { id: item.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function addFaqItemAction(botId: string, input: { title: string; pairs: { q: string; a: string }[] }): Promise<Result<{ id: string }>> {
  try {
    const { account } = await getAccountOrThrow();
    const item = await addFaqItem({ accountId: account.id, botId, title: input.title, pairs: input.pairs });
    revalidateBot(botId);
    return { error: null, data: { id: item.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function addUrlItemAction(botId: string, input: { url: string }): Promise<Result<{ id: string }>> {
  try {
    const { account } = await getAccountOrThrow();
    const item = await addUrlItem({ accountId: account.id, botId, url: input.url });
    revalidateBot(botId);
    return { error: null, data: { id: item.id } };
  } catch (err) {
    return fail(err);
  }
}

/** Campos do FormData: botId, file. */
export async function addFileItemAction(formData: FormData): Promise<Result<{ id: string }>> {
  try {
    const { account } = await getAccountOrThrow();
    const botId = String(formData.get("botId") ?? "");
    const file = formData.get("file");
    if (!botId) return { error: "Bot não informado." };
    if (!(file instanceof File) || !file.size) return { error: "Escolha um arquivo." };
    if (file.size > MAX_UPLOAD_BYTES) return { error: "O arquivo passa de 1 MB. Divida o conteúdo ou cole o texto como item de Texto." };
    const buffer = Buffer.from(await file.arrayBuffer());
    const item = await addFileItem({ accountId: account.id, botId, file: { name: file.name, buffer, mimeType: file.type } });
    revalidateBot(botId);
    return { error: null, data: { id: item.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateItemAction(id: string, patch: { title?: string; content?: string; pairs?: { q: string; a: string }[] }): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    const item = await getItem(account.id, id);
    if (!item) return { error: "Item não encontrado." };
    await updateItem(account.id, id, patch);
    revalidateBot(item.botId);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteItemAction(id: string): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    const item = await getItem(account.id, id);
    if (!item) return { error: null };
    await deleteItem(account.id, id);
    revalidateBot(item.botId);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

export async function reindexItemAction(id: string): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    const item = await getItem(account.id, id);
    if (!item) return { error: "Item não encontrado." };
    await reindexItem(account.id, id);
    revalidateBot(item.botId);
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}

import "server-only";
import { eq } from "drizzle-orm";
import { embed, transcribe, type ModelMessage, type UserContent } from "ai";
import { getDb, schema } from "../db";
import type { Bot, EvolutionNode, NumberRow } from "../db/schema";
import { getTenantStore } from "../tenant/registry";
import type { TenantStore, MessageRow } from "../tenant/store";
import { getEvolutionClient } from "../evolution/nodes";
import type { EvolutionClient, InboundMessage, WebhookEvent } from "../evolution/types";
import { getAccountAi, type AccountAi } from "../ai/provider";
import { logEvent } from "../services/events";
import { buildSystemPrompt, describeInbound, firstNameOf, mentionsName } from "./context";
import { isOpenNow } from "./hours";
import { getScheduler } from "./scheduler";
import { runLlmTurn, type ToolHandlers } from "./llm";
import { sleep, splitBubbles, typingDelayMs } from "./reply";
import { markSent, wasSentByUs } from "./sent-cache";
import { cacheImage, takeImage } from "./media-cache";
import { applyVariables, type BotConfig } from "@/shared/bot-config";
import { env } from "../env";

/**
 * Orquestrador: recebe eventos do webhook e conduz o atendimento.
 * Fluxo de mensagem: dedupe → contato/conversa → salva → (debounce) → responde.
 */

export type NumberContext = { number: NumberRow; node: EvolutionNode; bot: Bot | null };

export async function loadNumberContext(numberId: string): Promise<NumberContext | null> {
  const db = await getDb();
  const [number] = await db.select().from(schema.numbers).where(eq(schema.numbers.id, numberId)).limit(1);
  if (!number) return null;
  const [node] = await db.select().from(schema.evolutionNodes).where(eq(schema.evolutionNodes.id, number.nodeId)).limit(1);
  if (!node) return null;
  const bot = number.botId ? ((await db.select().from(schema.bots).where(eq(schema.bots.id, number.botId)).limit(1))[0] ?? null) : null;
  return { number, node, bot };
}

export async function handleWebhookEvent(numberId: string, event: WebhookEvent): Promise<void> {
  const ctx = await loadNumberContext(numberId);
  if (!ctx) return;
  const { number } = ctx;
  const db = await getDb();

  switch (event.type) {
    case "connection.update": {
      const status = event.state === "open" ? "open" : event.state === "connecting" ? "connecting" : "close";
      const patch: Partial<typeof schema.numbers.$inferInsert> = { status, statusUpdatedAt: new Date(), updatedAt: new Date() };
      if (status === "open") {
        patch.lastQr = null;
        patch.pairingCode = null;
        patch.lastError = null;
        try {
          const info = await getEvolutionClient(ctx.node).getState(number.instanceName);
          if (info.ownerJid) patch.phone = info.ownerJid.split("@")[0].split(":")[0];
          if (info.profileName) patch.profileName = info.profileName;
        } catch {}
      }
      await db.update(schema.numbers).set(patch).where(eq(schema.numbers.id, number.id));
      if (number.status !== status) {
        await logEvent({
          accountId: number.accountId,
          numberId: number.id,
          level: status === "close" ? "warn" : "info",
          type: "connection",
          message: status === "open" ? `Número "${number.label}" conectado.` : status === "close" ? `Número "${number.label}" desconectou.` : `Número "${number.label}" conectando…`,
          data: { statusReason: event.statusReason },
        });
      }
      return;
    }
    case "qrcode.updated": {
      await db
        .update(schema.numbers)
        .set({ lastQr: event.qr.base64 ?? number.lastQr, lastQrAt: new Date(), pairingCode: event.qr.pairingCode ?? number.pairingCode, status: number.status === "open" ? "open" : "qr", updatedAt: new Date() })
        .where(eq(schema.numbers.id, number.id));
      return;
    }
    case "logout":
    case "remove": {
      await db.update(schema.numbers).set({ status: "close", statusUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(schema.numbers.id, number.id));
      await logEvent({ accountId: number.accountId, numberId: number.id, level: "warn", type: "connection", message: `Número "${number.label}" foi desconectado (${event.type}).` });
      return;
    }
    case "messages.upsert":
      await handleInbound(ctx, event.message);
      return;
    default:
      return;
  }
}

function effective(ctx: NumberContext) {
  const cfg = ctx.bot?.config;
  const s = ctx.number.settings ?? {};
  return {
    pauseHours: s.pauseHoursOnHuman ?? cfg?.behavior.pauseHoursOnHuman ?? 6,
    debounceSeconds: s.debounceSeconds ?? cfg?.behavior.debounceSeconds ?? 4,
    timeoutHours: s.conversationTimeoutHours ?? 12,
    ignoreGroups: cfg?.behavior.ignoreGroups ?? true,
  };
}

async function handleInbound(ctx: NumberContext, msg: InboundMessage): Promise<void> {
  const { number } = ctx;
  const eff = effective(ctx);
  if (msg.isGroup && eff.ignoreGroups) return;
  const store = await getTenantStore(number.accountId);
  const db = await getDb();
  const now = new Date();
  const key = `${number.id}:${msg.remoteJid}`;

  if (msg.fromMe) {
    // Mensagem enviada pelo próprio número: se foi o bot (id conhecido), ignora; senão foi um humano no celular.
    if (wasSentByUs(number.id, msg.externalId)) return;
    if (await store.messageExists(number.id, msg.externalId)) return;
    const contact = await store.upsertContact({ numberId: number.id, jid: msg.remoteJid, phone: msg.phone });
    const { conversation } = await store.getOrCreateConversation({ numberId: number.id, contactId: contact.id, timeoutHours: eff.timeoutHours });
    await store.insertMessage({
      numberId: number.id,
      conversationId: conversation.id,
      contactId: contact.id,
      externalId: msg.externalId,
      direction: "out",
      sender: "human",
      type: msg.type,
      text: msg.text ?? msg.caption ?? null,
      mediaMime: msg.mimeType ?? null,
      createdAt: new Date(msg.timestamp * 1000),
    });
    if (eff.pauseHours > 0) await store.pauseContactBot(contact.id, new Date(now.getTime() + eff.pauseHours * 3600_000));
    await store.setConversationStatus(conversation.id, "human", false, "Atendente respondeu pelo celular");
    await store.bumpDailyStat(number.id, now, { messages_out: 1, human_messages: 1 });
    getScheduler().cancel(key);
    return;
  }

  if (await store.messageExists(number.id, msg.externalId)) return;

  const contact = await store.upsertContact({ numberId: number.id, jid: msg.remoteJid, phone: msg.phone, pushName: msg.pushName });
  const isNewContact = now.getTime() - new Date(contact.first_seen_at).getTime() < 10_000;
  const { conversation, created } = await store.getOrCreateConversation({ numberId: number.id, contactId: contact.id, timeoutHours: eff.timeoutHours });

  let transcript: string | null = null;
  if (msg.type === "audio" && (ctx.bot?.config.behavior.replyToAudio ?? true)) {
    transcript = await transcribeInbound(ctx, msg).catch((err) => {
      void logEvent({ accountId: number.accountId, numberId: number.id, level: "warn", type: "transcription", message: `Falha ao transcrever áudio: ${errMsg(err)}` });
      return null;
    });
  }
  if (msg.type === "image" && (ctx.bot?.config.behavior.replyToImages ?? true)) {
    await cacheInboundImage(ctx, msg).catch((err) => {
      void logEvent({ accountId: number.accountId, numberId: number.id, level: "warn", type: "vision", message: `Falha ao baixar imagem: ${errMsg(err)}` });
    });
  }

  await store.insertMessage({
    numberId: number.id,
    conversationId: conversation.id,
    contactId: contact.id,
    externalId: msg.externalId,
    direction: "in",
    sender: "contact",
    type: msg.type,
    text: msg.text ?? msg.caption ?? (msg.location ? [msg.location.name, msg.location.address].filter(Boolean).join(" — ") : null),
    transcript,
    mediaMime: msg.mimeType ?? null,
    meta: msg.location ? { location: msg.location } : null,
    createdAt: new Date(msg.timestamp * 1000),
  });
  await store.bumpDailyStat(number.id, now, { messages_in: 1, conversations: created ? 1 : 0, new_contacts: isNewContact ? 1 : 0 });
  await db.update(schema.numbers).set({ lastMessageAt: now }).where(eq(schema.numbers.id, number.id));

  // O bot deve responder?
  if (!number.botEnabled || !ctx.bot || !ctx.bot.isActive) return;
  if (contact.is_blocked || contact.bot_disabled) return;
  if (contact.bot_paused_until && new Date(contact.bot_paused_until) > now) return;
  if (conversation.status === "human") await store.setConversationStatus(conversation.id, "open", conversation.needs_human, null);

  try {
    await getEvolutionClient(ctx.node).markRead(number.instanceName, msg.remoteJid, msg.externalId);
  } catch {}

  getScheduler().schedule(key, eff.debounceSeconds * 1000, () =>
    respondToContact({ numberId: number.id, contactId: contact.id, conversationId: conversation.id, remoteJid: msg.remoteJid, phone: msg.phone }),
  );
}

async function transcribeInbound(ctx: NumberContext, msg: InboundMessage): Promise<string | null> {
  const ai = await getAccountAi(ctx.number.accountId);
  const model = ai.transcriptionModel();
  if (!model) return null;
  const media = await getEvolutionClient(ctx.node).getMedia(ctx.number.instanceName, msg.raw);
  if (!media) return null;
  const res = await transcribe({ model, audio: Buffer.from(media.base64, "base64") });
  return res.text?.trim() || null;
}

/** Baixa a imagem e guarda no cache curto para o turno de resposta poder "ver" (ver media-cache.ts). */
async function cacheInboundImage(ctx: NumberContext, msg: InboundMessage): Promise<void> {
  const media = await getEvolutionClient(ctx.node).getMedia(ctx.number.instanceName, msg.raw);
  if (!media) return;
  cacheImage(ctx.number.id, msg.externalId, media.base64, media.mimeType);
}

// ---------------------------------------------------------------------------
// Resposta do bot
// ---------------------------------------------------------------------------

export type RespondInput = { numberId: string; contactId: string; conversationId: string; remoteJid: string; phone: string };

export async function respondToContact(input: RespondInput): Promise<void> {
  const ctx = await loadNumberContext(input.numberId);
  if (!ctx || !ctx.bot || !ctx.number.botEnabled) return;
  const { number, bot } = ctx;
  const config = bot.config;
  const store = await getTenantStore(number.accountId);
  const db = await getDb();
  const client = getEvolutionClient(ctx.node);
  const contact = await store.getContact(input.contactId);
  const conversation = await store.getConversation(input.conversationId);
  if (!contact || !conversation) return;
  if (contact.is_blocked || contact.bot_disabled) return;
  if (contact.bot_paused_until && new Date(contact.bot_paused_until) > new Date()) return;

  const recent = await store.recentMessages(conversation.id, config.behavior.historyMessages);
  let lastNonContact = -1;
  recent.forEach((m, i) => {
    if (m.sender !== "contact") lastNonContact = i;
  });
  const pending = recent.slice(lastNonContact + 1);
  if (!pending.length) return;

  const started = Date.now();
  try {
    const ai = await getAccountAi(number.accountId);
    const queryText = pending.map((m) => describeInbound(m)).join("\n");
    const knowledge = await retrieveKnowledge(store, bot.id, queryText, ai, config.model.ragChunks);
    const eff = effective(ctx);
    const contactName = contact.name ?? contact.push_name ?? null;

    const sent: { text: string; id: string; meta?: Record<string, unknown> }[] = [];
    const send = async (text: string, meta?: Record<string, unknown>) => {
      const delay = env.isProd ? typingDelayMs(text) : Math.min(typingDelayMs(text), 800);
      try {
        await client.sendPresence(number.instanceName, input.phone, "composing", delay);
      } catch {}
      await sleep(delay);
      const res = await client.sendText(number.instanceName, { number: input.phone, text });
      markSent(number.id, res.messageId);
      sent.push({ text, id: res.messageId, meta });
      await store.insertMessage({
        numberId: number.id,
        conversationId: conversation.id,
        contactId: contact.id,
        externalId: res.messageId || null,
        direction: "out",
        sender: "bot",
        type: "text",
        text,
        meta: meta ?? null,
      });
    };

    // Aviso de fora do horário (uma vez por conversa).
    if (isOpenNow(config.business.hours) === false && config.behavior.offHoursMessage.trim()) {
      const already = recent.some((m) => m.sender === "bot" && m.meta && (m.meta as Record<string, unknown>).offHours);
      if (!already) {
        const vars = { nome_empresa: config.identity.businessName, ...number.variables };
        await send(applyVariables(config.behavior.offHoursMessage, vars), { offHours: true });
      }
    }

    const handlers = buildHandlers({ ctx, store, client, contact: { id: contact.id, name: contactName, phone: input.phone }, conversationId: conversation.id, eff, knowledgeCount: knowledge.length });
    const tools = Object.keys(handlers);
    const firstName = firstNameOf(contactName);
    const nameAlreadyUsed = !!firstName && recent.some((m) => m.sender === "bot" && mentionsName(m.text, firstName));
    const system = buildSystemPrompt({ config, variables: number.variables, contactName, nameAlreadyUsed, knowledge: knowledge.map((k) => k.content), tools });
    const messages = toModelMessages(recent, number.id);
    const isFirstTurn = !recent.some((m) => m.sender !== "contact");

    const result = await runLlmTurn({
      model: ai.languageModel(config.model.name || undefined),
      modelName: config.model.name || ai.defaultModel,
      system,
      messages,
      handlers,
      temperature: config.model.temperature,
      maxOutputTokens: config.model.maxOutputTokens,
      categoryOptions: config.categorization.enabled ? config.categorization.options : [],
      mock: { config, knowledge: knowledge.map((k) => k.content), lastUserText: queryText, isFirstTurn, variables: number.variables },
    });

    const bubbles = splitBubbles(result.text, config.behavior.maxBubbleChars);
    for (const b of bubbles) await send(b);

    if (sent.length) {
      // Anota modelo/tokens na última mensagem enviada (custo por resposta).
      await store.bumpDailyStat(number.id, new Date(), {
        messages_out: sent.length,
        bot_messages: sent.length,
        tokens_in: result.usage.inputTokens,
        tokens_out: result.usage.outputTokens,
      });
      await store.insertMessage({
        numberId: number.id,
        conversationId: conversation.id,
        contactId: contact.id,
        direction: "out",
        sender: "system",
        type: "meta",
        status: "ignored",
        text: null,
        model: result.model,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        latencyMs: Date.now() - started,
        meta: { toolCalls: result.toolCalls.map((t) => t.name), knowledge: knowledge.map((k) => k.id), simulated: result.simulated },
      });
    }
    await db.update(schema.numbers).set({ lastError: null }).where(eq(schema.numbers.id, number.id));
  } catch (err) {
    const message = errMsg(err);
    await db.update(schema.numbers).set({ lastError: message.slice(0, 300) }).where(eq(schema.numbers.id, number.id));
    await logEvent({ accountId: number.accountId, numberId: number.id, level: "error", type: "reply", message: `Falha ao responder ${input.phone}: ${message}`, data: { conversationId: conversation.id } });
  }
}

/** Conteúdo de uma mensagem do usuário sempre como array, para poder anexar partes (texto/imagem). */
function asContentParts(content: UserContent): Exclude<UserContent, string> {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}

export function toModelMessages(rows: MessageRow[], numberId: string): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of rows) {
    if (m.sender === "system") continue;
    if (m.sender === "contact") {
      const image = m.type === "image" ? takeImage(numberId, m.external_id) : null;
      const last = out[out.length - 1];
      if (image) {
        const caption = (m.text ?? "").trim();
        const parts: Exclude<UserContent, string> = [{ type: "file", data: image.base64, mediaType: image.mimeType }];
        if (caption) parts.push({ type: "text", text: caption });
        if (last && last.role === "user") last.content = [...asContentParts(last.content), ...parts];
        else out.push({ role: "user", content: parts });
        continue;
      }
      const text = describeInbound(m);
      if (!text) continue;
      if (last && last.role === "user" && typeof last.content === "string") last.content = last.content + "\n" + text;
      else out.push({ role: "user", content: text });
    } else {
      const text = (m.sender === "human" ? "[atendente humano respondeu] " : "") + (m.text ?? "");
      if (!text.trim()) continue;
      const last = out[out.length - 1];
      if (last && last.role === "assistant" && typeof last.content === "string") last.content = last.content + "\n\n" + text;
      else out.push({ role: "assistant", content: text });
    }
  }
  // O modelo precisa terminar com uma mensagem do usuário.
  while (out.length && out[out.length - 1].role !== "user") out.pop();
  if (out.length && out[0].role === "assistant") out.unshift({ role: "user", content: "(início da conversa)" });
  return out;
}

export async function retrieveKnowledge(store: TenantStore, botId: string, query: string, ai: AccountAi, limit: number) {
  if (limit <= 0 || !query.trim()) return [];
  const model = ai.embeddingModel();
  if (model) {
    try {
      const { embedding } = await embed({ model, value: query.slice(0, 4000) });
      const rows = await store.searchChunks(botId, embedding, limit);
      return rows.filter((r) => Number(r.distance) < 0.62);
    } catch (err) {
      console.warn("[rag] embedding falhou, usando busca textual:", errMsg(err));
    }
  }
  return store.searchChunksByText(botId, query, limit);
}

type HandlerDeps = {
  ctx: NumberContext;
  store: TenantStore;
  client: EvolutionClient;
  contact: { id: string; name: string | null; phone: string };
  conversationId: string;
  eff: ReturnType<typeof effective>;
  knowledgeCount: number;
};

function buildHandlers(d: HandlerDeps): ToolHandlers {
  const config = d.ctx.bot!.config as BotConfig;
  const { number } = d.ctx;
  const handlers: ToolHandlers = {};

  if (config.categorization.enabled && config.categorization.options.length) {
    handlers.categorizar_conversa = async ({ categoria }) => {
      await d.store.setConversationCategory(d.conversationId, categoria);
      return "Categoria registrada.";
    };
  }
  if (config.actions.handoff.enabled) {
    handlers.chamar_atendente = async ({ motivo, resumo }) => {
      await d.store.setConversationStatus(d.conversationId, "human", true, motivo);
      if (d.eff.pauseHours > 0) await d.store.pauseContactBot(d.contact.id, new Date(Date.now() + d.eff.pauseHours * 3600_000));
      await d.store.bumpDailyStat(number.id, new Date(), { handoffs: 1 });
      const notify = number.settings.notifyPhone?.replace(/\D/g, "");
      if (notify) {
        const text = `🔔 *Atendimento humano solicitado*\nCliente: ${d.contact.name ?? "sem nome"} (+${d.contact.phone})\nMotivo: ${motivo}\nResumo: ${resumo}\n\nResponda o cliente direto pelo WhatsApp; o assistente fica em silêncio por ${d.eff.pauseHours}h.`;
        d.client
          .sendText(number.instanceName, { number: notify, text })
          .then((res) => markSent(number.id, res.messageId))
          .catch((err) => logEvent({ accountId: number.accountId, numberId: number.id, level: "warn", type: "notify", message: `Falha ao avisar ${notify}: ${errMsg(err)}` }));
      }
      await logEvent({ accountId: number.accountId, numberId: number.id, type: "handoff", message: `Cliente +${d.contact.phone} pediu atendimento humano: ${motivo}` });
      return "Equipe avisada. Diga ao cliente, em uma frase, que uma pessoa vai continuar o atendimento em breve.";
    };
  }
  if (config.actions.sendMenu.enabled && config.actions.sendMenu.mediaUrl) {
    handlers.enviar_cardapio = async () => {
      const url = config.actions.sendMenu.mediaUrl;
      const isPdf = /\.pdf(\?|$)/i.test(url);
      const res = await d.client.sendMedia(number.instanceName, {
        number: d.contact.phone,
        mediaType: isPdf ? "document" : "image",
        media: url,
        mimeType: isPdf ? "application/pdf" : undefined,
        fileName: isPdf ? "cardapio.pdf" : undefined,
        caption: applyVariables(config.actions.sendMenu.caption, { nome_empresa: config.identity.businessName, ...number.variables }) || undefined,
      });
      markSent(number.id, res.messageId);
      await d.store.insertMessage({ numberId: number.id, conversationId: d.conversationId, contactId: d.contact.id, externalId: res.messageId || null, direction: "out", sender: "bot", type: isPdf ? "document" : "image", text: `[${config.actions.sendMenu.label || "cardápio"} enviado]` });
      return "Cardápio enviado com sucesso.";
    };
  }
  if (config.actions.sendLocation.enabled && config.actions.sendLocation.lat && config.actions.sendLocation.lng) {
    handlers.enviar_localizacao = async () => {
      const loc = config.actions.sendLocation;
      const res = await d.client.sendLocation(number.instanceName, { number: d.contact.phone, name: loc.name || config.identity.businessName, address: loc.address || config.business.address, latitude: loc.lat, longitude: loc.lng });
      markSent(number.id, res.messageId);
      await d.store.insertMessage({ numberId: number.id, conversationId: d.conversationId, contactId: d.contact.id, externalId: res.messageId || null, direction: "out", sender: "bot", type: "location", text: `[localização enviada] ${loc.name}` });
      return "Localização enviada.";
    };
  }
  return handlers;
}

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

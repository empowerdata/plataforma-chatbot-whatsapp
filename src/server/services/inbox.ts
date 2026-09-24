import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getTenantStore, type MessageRow } from "../tenant";
import type { Contact, Conversation, ConversationListRow } from "../tenant/store";
import { getEvolutionClient } from "../evolution/nodes";
import { markSent } from "../engine/sent-cache";
import { getScheduler } from "../engine/scheduler";
import type { BotConfig } from "@/shared/bot-config";
import type { NumberSettings } from "@/shared/number-settings";
import { dayKey, formatDateTime, formatDayLabel, formatListTime, formatNumber, formatPhone, formatRelative, formatTime, initials } from "@/lib/utils";
import type { BotState, InboxConversation, InboxCounts, InboxFilters, InboxListItem, InboxThreadItem, InboxView } from "@/components/inbox/types";

/**
 * Caixa de entrada das conversas — um serviço só para o painel da equipe e
 * para o portal do cliente final. O escopo decide o que cada um alcança:
 * a equipe vê todos os números da conta; o cliente final (clientId) só os
 * números dele. Toda consulta e toda ação passam por `scopeNumbers`, então um
 * cliente nunca toca a conversa de outro, mesmo adivinhando um id.
 */
export type InboxScope = { accountId: string; clientId: string | null; staff: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ScopeNumber = {
  id: string;
  label: string;
  status: string;
  botEnabled: boolean;
  instanceName: string;
  nodeId: string;
  settings: NumberSettings;
  botName: string | null;
  botActive: boolean | null;
  botConfig: BotConfig | null;
};

async function scopeNumbers(scope: InboxScope): Promise<ScopeNumber[]> {
  const db = await getDb();
  const conds = [eq(schema.numbers.accountId, scope.accountId)];
  if (scope.clientId) conds.push(eq(schema.numbers.clientId, scope.clientId));
  return db
    .select({
      id: schema.numbers.id,
      label: schema.numbers.label,
      status: schema.numbers.status,
      botEnabled: schema.numbers.botEnabled,
      instanceName: schema.numbers.instanceName,
      nodeId: schema.numbers.nodeId,
      settings: schema.numbers.settings,
      botName: schema.bots.name,
      botActive: schema.bots.isActive,
      botConfig: schema.bots.config,
    })
    .from(schema.numbers)
    .leftJoin(schema.bots, eq(schema.bots.id, schema.numbers.botId))
    .where(and(...conds));
}

/** Mesma regra do motor (effective() em inbound.ts): ajuste do número → config do bot → 6h. */
function pauseHoursFor(num: ScopeNumber): number {
  return num.settings?.pauseHoursOnHuman ?? num.botConfig?.behavior.pauseHoursOnHuman ?? 6;
}

function pauseLabel(until: Date): string {
  return dayKey(until) === dayKey(new Date()) ? `às ${formatTime(until)}` : `em ${formatDateTime(until)}`;
}

function computeBotState(
  num: ScopeNumber,
  contact: { is_blocked: boolean; bot_disabled: boolean; bot_paused_until: Date | string | null },
  conv: { needs_human: boolean; status: string },
): BotState {
  if (!num.botName || num.botActive === false) return { kind: "no_bot" };
  if (!num.botEnabled) return { kind: "number_off" };
  if (contact.is_blocked) return { kind: "blocked" };
  if (contact.bot_disabled) return { kind: "off" };
  if (contact.bot_paused_until) {
    const until = new Date(contact.bot_paused_until);
    if (until.getTime() > Date.now()) {
      return { kind: "paused", until: pauseLabel(until), reason: conv.needs_human ? "handoff" : conv.status === "human" ? "human_reply" : "other" };
    }
  }
  return { kind: "active" };
}

function viewFilter(view: InboxView): { resolved?: boolean; needsHuman?: boolean } {
  switch (view) {
    case "abertas":
      return { resolved: false };
    case "atencao":
      return { resolved: false, needsHuman: true };
    case "finalizadas":
      return { resolved: true };
    default:
      return {};
  }
}

const EMPTY_COUNTS: InboxCounts = { abertas: 0, atencao: 0, finalizadas: 0, todas: 0 };

const VIEWS: InboxView[] = ["abertas", "atencao", "finalizadas", "todas"];

/** Lê filtros e conversa selecionada da URL (?v=&cat=&n=&q=&c=), sempre tolerante a lixo. */
export function parseInboxParams(sp: Record<string, string | string[] | undefined>): { filters: InboxFilters; selectedId: string | null } {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view = one("v") as InboxView;
  const c = one("c");
  const n = one("n");
  return {
    filters: {
      view: VIEWS.includes(view) ? view : "abertas",
      category: one("cat").slice(0, 40) || null,
      numberId: UUID_RE.test(n) ? n : null,
      search: one("q").slice(0, 80),
    },
    selectedId: UUID_RE.test(c) ? c : null,
  };
}

export type InboxList = {
  items: InboxListItem[];
  counts: InboxCounts;
  categories: string[];
  numbers: { id: string; label: string }[];
};

export async function listInbox(scope: InboxScope, filters: InboxFilters, limit = 150): Promise<InboxList> {
  const nums = await scopeNumbers(scope);
  const numbers = nums.map((n) => ({ id: n.id, label: n.label }));
  if (!nums.length) return { items: [], counts: EMPTY_COUNTS, categories: [], numbers };
  const byId = new Map(nums.map((n) => [n.id, n]));
  const numberIds = filters.numberId && byId.has(filters.numberId) ? [filters.numberId] : nums.map((n) => n.id);
  const store = await getTenantStore(scope.accountId);

  const [rows, categories, abertas, atencao, finalizadas, todas] = await Promise.all([
    store.listConversations({ numberIds, ...viewFilter(filters.view), category: filters.category ?? undefined, search: filters.search || undefined, limit }),
    store.listCategoriesInUse(nums.map((n) => n.id)),
    store.countConversations({ numberIds, resolved: false }),
    store.countConversations({ numberIds, resolved: false, needsHuman: true }),
    store.countConversations({ numberIds, resolved: true }),
    store.countConversations({ numberIds }),
  ]);

  return {
    items: rows.map((r) => toListItem(r, byId.get(r.number_id))),
    counts: { abertas, atencao, finalizadas, todas },
    categories,
    numbers,
  };
}

function toListItem(r: ConversationListRow, num: ScopeNumber | undefined): InboxListItem {
  const name = r.contact_name ?? r.contact_push_name ?? null;
  const state = num ? computeBotState(num, { is_blocked: r.contact_is_blocked, bot_disabled: r.contact_bot_disabled, bot_paused_until: r.contact_bot_paused_until }, r) : { kind: "no_bot" as const };
  return {
    id: r.id,
    title: name ?? formatPhone(r.contact_phone),
    initials: initials(name),
    phone: name && r.contact_phone ? formatPhone(r.contact_phone) : null,
    preview: r.last_message_preview,
    lastAt: formatListTime(r.last_message_at),
    numberLabel: num?.label ?? "—",
    category: r.category,
    resolved: r.resolved_at != null,
    needsHuman: r.needs_human,
    bot: state.kind === "active" || state.kind === "off" || state.kind === "paused" ? state.kind : "unavailable",
  };
}

// ------------------------------------------------------------------- detalhe

export async function getInboxConversation(scope: InboxScope, conversationId: string): Promise<InboxConversation | null> {
  const loaded = await load(scope, conversationId).catch(() => null);
  if (!loaded) return null;
  const { store, conversation: c, contact, num } = loaded;
  const messages = await store.listMessages(c.id, 300);
  const name = contact.name ?? contact.push_name ?? null;
  return {
    id: c.id,
    title: name ?? formatPhone(contact.phone),
    initials: initials(name),
    phone: formatPhone(contact.phone),
    numberId: num.id,
    numberLabel: num.label,
    numberConnected: num.status === "open",
    pauseHoursOnReply: pauseHoursFor(num),
    category: c.category,
    resolved: c.resolved_at != null,
    needsHuman: c.needs_human,
    handoffReason: c.handoff_reason,
    bot: computeBotState(num, contact, c),
    botName: num.botName,
    createdAt: formatDateTime(c.created_at),
    messageCount: Number(c.message_count ?? 0),
    contact: {
      name: contact.name,
      pushName: contact.push_name,
      phone: formatPhone(contact.phone),
      notes: contact.notes ?? "",
      firstSeenAt: formatDateTime(contact.first_seen_at),
      lastSeenAt: formatRelative(contact.last_seen_at),
      isBlocked: contact.is_blocked === true,
    },
    thread: buildThread(messages, scope.staff),
  };
}

const TOOL_LABELS: Record<string, string> = {
  chamar_atendente: "chamou a equipe",
  enviar_cardapio: "enviou o cardápio",
  enviar_localizacao: "enviou a localização",
  categorizar_conversa: "categorizou",
};

function metaOf(m: MessageRow): Record<string, unknown> {
  const raw: unknown = m.meta;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function bubbleBody(m: MessageRow): string {
  const text = (m.text ?? "").trim();
  const tagged = (tag: string) => (text ? (text.startsWith("[") ? text : `${tag} ${text}`) : tag);
  switch (m.type) {
    case "text":
      return text || "[mensagem vazia]";
    case "audio":
      return m.transcript?.trim() ? `🎤 ${m.transcript.trim()}` : "🎤 [áudio]";
    case "image":
      return tagged("📷 [imagem]");
    case "video":
      return tagged("[vídeo]");
    case "document":
      return tagged("📄 [documento]");
    case "location":
      return tagged("📍 [localização]");
    case "sticker":
      return "[figurinha]";
    default:
      return text || "[mídia]";
  }
}

/** Linha discreta com o custo/modelo da resposta do bot (só a equipe vê). */
function costLine(m: MessageRow, meta: Record<string, unknown>): string | null {
  if (meta.simulated === true) return "resposta simulada (sem chave da OpenAI)";
  if (!m.model) return null;
  const parts = [m.model];
  if (m.latency_ms != null && m.latency_ms >= 0) parts.push(`${(m.latency_ms / 1000).toFixed(1).replace(".", ",")}s`);
  const tokens = Number(m.tokens_in ?? 0) + Number(m.tokens_out ?? 0);
  if (tokens > 0) parts.push(`${formatNumber(tokens)} tokens`);
  const tools = Array.isArray(meta.toolCalls) ? meta.toolCalls.filter((t): t is string => typeof t === "string") : [];
  if (tools.length) parts.push(tools.map((t) => TOOL_LABELS[t] ?? t).join(", "));
  return parts.join(" · ");
}

function buildThread(messages: MessageRow[], staff: boolean): InboxThreadItem[] {
  const items: InboxThreadItem[] = [];
  let lastDay: string | null = null;
  let lastBot: Extract<InboxThreadItem, { kind: "message" }> | null = null;
  for (const m of messages) {
    const meta = metaOf(m);
    if (m.sender === "system") {
      const tools = Array.isArray(meta.toolCalls) ? meta.toolCalls : [];
      if (tools.includes("chamar_atendente")) items.push({ kind: "event", id: `${m.id}-handoff`, text: "O bot chamou alguém da equipe para continuar" });
      if (staff && lastBot) lastBot.meta = costLine(m, meta);
      continue;
    }
    const at = new Date(m.created_at);
    const key = dayKey(at);
    if (key !== lastDay) {
      items.push({ kind: "day", id: `day-${key}`, label: formatDayLabel(at) });
      lastDay = key;
    }
    const author = m.sender === "human" ? (typeof meta.author === "string" && meta.author ? meta.author : meta.via === "painel" ? "Equipe" : "Pelo celular") : null;
    const item: Extract<InboxThreadItem, { kind: "message" }> = { kind: "message", id: m.id, sender: m.sender, author, body: bubbleBody(m), time: formatTime(at), meta: null, offHours: meta.offHours === true };
    items.push(item);
    if (m.sender === "bot") lastBot = item;
  }
  return items;
}

// -------------------------------------------------------------------- ações

type Loaded = { store: Awaited<ReturnType<typeof getTenantStore>>; conversation: Conversation; contact: Contact; num: ScopeNumber };

/** Carrega a conversa só se o número dela estiver no escopo; senão, "não encontrada". */
async function load(scope: InboxScope, conversationId: string): Promise<Loaded> {
  if (!UUID_RE.test(conversationId)) throw new Error("Conversa não encontrada.");
  const store = await getTenantStore(scope.accountId);
  const conversation = await store.getConversation(conversationId);
  if (!conversation) throw new Error("Conversa não encontrada.");
  const num = (await scopeNumbers(scope)).find((n) => n.id === conversation.number_id);
  if (!num) throw new Error("Conversa não encontrada.");
  const contact = await store.getContact(conversation.contact_id);
  if (!contact) throw new Error("Conversa não encontrada.");
  return { store, conversation, contact, num };
}

export async function setInboxResolved(scope: InboxScope, id: string, resolved: boolean): Promise<void> {
  const { store, conversation } = await load(scope, id);
  await store.setConversationResolved(conversation.id, resolved);
}

export async function setInboxCategory(scope: InboxScope, id: string, category: string | null): Promise<void> {
  const { store, conversation } = await load(scope, id);
  const clean = category?.trim().slice(0, 40) || null;
  await store.setConversationCategory(conversation.id, clean);
}

/** Liga/desliga o bot nesta conversa. Ligar também encerra qualquer pausa automática e o "precisa de você". */
export async function setInboxBot(scope: InboxScope, id: string, enabled: boolean): Promise<void> {
  const { store, conversation, contact, num } = await load(scope, id);
  if (!enabled) {
    await store.setContactBotDisabled(contact.id, true);
    return;
  }
  if (!num.botName || num.botActive === false) throw new Error(scope.staff ? "Este número não tem um bot ativo. Escolha um bot em Números." : "Este número ainda não tem um bot configurado.");
  if (!num.botEnabled) throw new Error(scope.staff ? "O bot está desligado no número inteiro. Religue em Números." : "O bot está desligado neste número. Fale com quem administra o seu atendimento.");
  if (contact.is_blocked) throw new Error("Este contato está bloqueado. Desbloqueie para o bot voltar a responder.");
  await store.resumeContactBot(contact.id);
  await store.setConversationStatus(conversation.id, conversation.status === "human" ? "open" : conversation.status, false, null);
}

/**
 * Resposta humana pelo próprio painel. Vale a mesma regra de quando alguém
 * responde pelo celular: o bot pausa neste contato pelo tempo configurado no
 * bot (padrão 6h) e volta sozinho depois — ou na hora, pelo interruptor.
 */
export async function sendInboxMessage(scope: InboxScope, id: string, text: string, author: string): Promise<void> {
  const body = text.trim();
  if (!body) throw new Error("Escreva uma mensagem.");
  if (body.length > 4000) throw new Error("Mensagem longa demais (máximo de 4.000 caracteres).");
  const { store, conversation, contact, num } = await load(scope, id);
  if (num.status !== "open") throw new Error("O WhatsApp deste número está desconectado. Reconecte para enviar mensagens.");
  if (contact.is_blocked) throw new Error("Este contato está bloqueado.");

  const db = await getDb();
  const [node] = await db.select().from(schema.evolutionNodes).where(eq(schema.evolutionNodes.id, num.nodeId)).limit(1);
  if (!node) throw new Error("Servidor do WhatsApp não encontrado.");
  const res = await getEvolutionClient(node).sendText(num.instanceName, { number: contact.phone ?? contact.jid.split("@")[0], text: body });
  // Sem isto, o eco da própria mensagem (fromMe) seria lido como "respondeu pelo celular".
  markSent(num.id, res.messageId);
  getScheduler().cancel(`${num.id}:${contact.jid}`);

  const now = new Date();
  await store.insertMessage({ numberId: num.id, conversationId: conversation.id, contactId: contact.id, externalId: res.messageId || null, direction: "out", sender: "human", type: "text", text: body, meta: { via: "painel", author } });
  await store.bumpDailyStat(num.id, now, { messages_out: 1, human_messages: 1 });
  const pauseHours = pauseHoursFor(num);
  if (pauseHours > 0 && !contact.bot_disabled) await store.pauseContactBot(contact.id, new Date(now.getTime() + pauseHours * 3600_000));
  await store.setConversationStatus(conversation.id, "human", false, "Respondido pelo painel");
  if (conversation.resolved_at) await store.setConversationResolved(conversation.id, false);
  await db.update(schema.numbers).set({ lastMessageAt: now }).where(eq(schema.numbers.id, num.id));
}

export async function saveInboxNotes(scope: InboxScope, id: string, notes: string): Promise<void> {
  const { store, contact } = await load(scope, id);
  await store.setContactNotes(contact.id, notes.trim().slice(0, 4000) || null);
}

export async function renameInboxContact(scope: InboxScope, id: string, name: string): Promise<void> {
  const { store, contact } = await load(scope, id);
  await store.setContactName(contact.id, name.trim().slice(0, 80) || null);
}

export async function setInboxBlocked(scope: InboxScope, id: string, blocked: boolean): Promise<void> {
  const { store, contact } = await load(scope, id);
  await store.setContactBlocked(contact.id, blocked);
}

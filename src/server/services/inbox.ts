import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getTenantStore, type MessageRow } from "../tenant";
import type { Contact, Conversation, ConversationListRow } from "../tenant/store";
import { getEvolutionClient } from "../evolution/nodes";
import { markSent } from "../engine/sent-cache";
import { isMediaRef, mediaRefFrom } from "../evolution/media-ref";
import { leadForConversation, moveLeadTo } from "./crm";
import { getScheduler } from "../engine/scheduler";
import type { BotConfig } from "@/shared/bot-config";
import type { NumberSettings } from "@/shared/number-settings";
import { dayKey, formatDateTime, formatDayLabel, formatListTime, formatNumber, formatPhone, formatRelative, formatTime, initials } from "@/lib/utils";
import { INBOX_MAX, INBOX_PAGE, MEDIA_MAX_BYTES, type BotState, type InboxMedia, type ConversationStatus, type InboxConversation, type InboxCounts, type InboxFilters, type InboxListItem, type InboxThreadItem, type InboxView } from "@/components/inbox/types";

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
  clientId: string | null;
  clientName: string | null;
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
      clientId: schema.numbers.clientId,
      clientName: schema.clients.name,
      botName: schema.bots.name,
      botActive: schema.bots.isActive,
      botConfig: schema.bots.config,
    })
    .from(schema.numbers)
    .leftJoin(schema.bots, eq(schema.bots.id, schema.numbers.botId))
    .leftJoin(schema.clients, eq(schema.clients.id, schema.numbers.clientId))
    .where(and(...conds));
}

function statusOf(resolved: boolean, needsHuman: boolean, bot: BotState): ConversationStatus {
  if (resolved) return "finalizada";
  if (needsHuman) return "aguardando";
  return bot.kind === "active" ? "bot" : "equipe";
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
  const cl = one("cl");
  const lim = Math.round(Number(one("lim")) / INBOX_PAGE) * INBOX_PAGE;
  return {
    filters: {
      view: VIEWS.includes(view) ? view : "abertas",
      category: one("cat").slice(0, 40) || null,
      numberId: UUID_RE.test(n) ? n : null,
      clientId: UUID_RE.test(cl) ? cl : null,
      search: one("q").slice(0, 80),
      limit: lim >= INBOX_PAGE && lim <= INBOX_MAX ? lim : INBOX_PAGE,
    },
    selectedId: UUID_RE.test(c) ? c : null,
  };
}

export type InboxList = {
  items: InboxListItem[];
  counts: InboxCounts;
  categories: string[];
  /** Números no filtro atual de cliente (para o seletor de número). */
  numbers: { id: string; label: string }[];
  /** Clientes com números no escopo (a equipe filtra por eles; o portal só tem um). */
  clients: { id: string; name: string }[];
  /** Tem mais conversas do que as carregadas ("carregar mais"). */
  hasMore: boolean;
  /** O escopo não tem número nenhum (ainda nada para mostrar). */
  noNumbers: boolean;
};

export async function listInbox(scope: InboxScope, filters: InboxFilters): Promise<InboxList> {
  const nums = await scopeNumbers(scope);
  const clientMap = new Map<string, string>();
  for (const n of nums) if (n.clientId && n.clientName) clientMap.set(n.clientId, n.clientName);
  const clients = [...clientMap].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const inClient = filters.clientId ? nums.filter((n) => n.clientId === filters.clientId) : nums;
  const numbers = inClient.map((n) => ({ id: n.id, label: n.label }));
  const base = { categories: [] as string[], numbers, clients, hasMore: false, noNumbers: nums.length === 0 };
  if (!inClient.length) return { ...base, items: [], counts: EMPTY_COUNTS };

  const byId = new Map(nums.map((n) => [n.id, n]));
  const numberIds = filters.numberId && inClient.some((n) => n.id === filters.numberId) ? [filters.numberId] : inClient.map((n) => n.id);
  const store = await getTenantStore(scope.accountId);

  const [rows, categories, abertas, atencao, finalizadas, todas] = await Promise.all([
    store.listConversations({ numberIds, ...viewFilter(filters.view), category: filters.category ?? undefined, search: filters.search || undefined, limit: filters.limit }),
    store.listCategoriesInUse(inClient.map((n) => n.id)),
    store.countConversations({ numberIds, resolved: false }),
    store.countConversations({ numberIds, resolved: false, needsHuman: true }),
    store.countConversations({ numberIds, resolved: true }),
    store.countConversations({ numberIds }),
  ]);

  return {
    ...base,
    items: rows.map((r) => toListItem(r, byId.get(r.number_id))),
    counts: { abertas, atencao, finalizadas, todas },
    categories,
    hasMore: rows.length >= filters.limit,
  };
}

function toListItem(r: ConversationListRow, num: ScopeNumber | undefined): InboxListItem {
  const name = r.contact_name ?? r.contact_push_name ?? null;
  const state: BotState = num ? computeBotState(num, { is_blocked: r.contact_is_blocked, bot_disabled: r.contact_bot_disabled, bot_paused_until: r.contact_bot_paused_until }, r) : { kind: "no_bot" };
  return {
    id: r.id,
    title: name ?? formatPhone(r.contact_phone),
    initials: initials(name),
    phone: name && r.contact_phone ? formatPhone(r.contact_phone) : null,
    preview: r.last_message_preview,
    lastAt: formatListTime(r.last_message_at),
    numberLabel: num?.label ?? "—",
    clientName: num?.clientName ?? null,
    category: r.category ?? r.suggested_category,
    categorySuggested: !r.category && !!r.suggested_category,
    status: statusOf(r.resolved_at != null, r.needs_human, state),
  };
}

// ------------------------------------------------------------------- detalhe

function leadOf(store: Awaited<ReturnType<typeof getTenantStore>>, num: ScopeNumber, contact: Contact) {
  return leadForConversation(store, num.clientId, contact, num.label).catch(() => null);
}

export async function getInboxConversation(scope: InboxScope, conversationId: string): Promise<InboxConversation | null> {
  const loaded = await load(scope, conversationId).catch(() => null);
  if (!loaded) return null;
  const { store, conversation: c, contact, num } = loaded;
  // Histórico da pessoa inteiro (atravessa as conversas): quem atende vê o retorno.
  const [messages, lead] = await Promise.all([store.listContactMessages(contact.id, 300), leadOf(store, num, contact)]);
  const name = contact.name ?? contact.push_name ?? null;
  const bot = computeBotState(num, contact, c);
  return {
    id: c.id,
    title: name ?? formatPhone(contact.phone),
    initials: initials(name),
    phone: formatPhone(contact.phone),
    numberId: num.id,
    numberLabel: num.label,
    clientName: num.clientName,
    numberConnected: num.status === "open",
    pauseHoursOnReply: pauseHoursFor(num),
    category: c.category,
    suggestedCategory: c.category ? null : c.suggested_category,
    lead: lead?.view ?? null,
    status: statusOf(c.resolved_at != null, c.needs_human, bot),
    resolved: c.resolved_at != null,
    needsHuman: c.needs_human,
    handoffReason: c.handoff_reason,
    bot,
    botName: num.botName,
    createdAt: formatDateTime(c.created_at),
    messageCount: Number(c.message_count ?? 0),
    contact: {
      name: contact.name,
      pushName: contact.push_name,
      phone: formatPhone(contact.phone),
      notes: lead?.notes ?? contact.notes ?? "",
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

const MEDIA_KINDS = new Set<string>(["image", "video", "audio", "document", "sticker"]);

/** Mídia que dá para abrir: só quando temos o endereço dela (mensagens de antes desta versão ficam com a etiqueta). */
function mediaOf(m: MessageRow, meta: Record<string, unknown>): InboxMedia | null {
  if (!MEDIA_KINDS.has(m.type) || !isMediaRef(meta.media)) return null;
  return { kind: m.type as InboxMedia["kind"], url: `/api/inbox/media/${m.id}`, fileName: typeof meta.fileName === "string" ? meta.fileName : null };
}

function captionOf(m: MessageRow, media: InboxMedia): string {
  const text = (m.text ?? "").trim();
  if (media.kind === "audio" || media.kind === "sticker") return "";
  return text && text !== media.fileName ? text : "";
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

function gapLabel(ms: number): string {
  const h = Math.round(ms / 3600_000);
  if (h < 24) return `${Math.max(1, h)} h`;
  const d = Math.round(h / 24);
  return `${d} dia${d === 1 ? "" : "s"}`;
}

function buildThread(messages: MessageRow[], staff: boolean): InboxThreadItem[] {
  const items: InboxThreadItem[] = [];
  let lastDay: string | null = null;
  let lastBot: Extract<InboxThreadItem, { kind: "message" }> | null = null;
  let lastConv: { id: string; at: number } | null = null;
  for (const m of messages) {
    const meta = metaOf(m);
    if (m.sender === "system") {
      const tools = Array.isArray(meta.toolCalls) ? meta.toolCalls : [];
      if (tools.includes("chamar_atendente")) items.push({ kind: "event", id: `${m.id}-handoff`, text: "O bot chamou alguém da equipe para continuar" });
      if (staff && lastBot) lastBot.meta = costLine(m, meta);
      continue;
    }
    const at = new Date(m.created_at);
    // A mesma pessoa voltando depois de um tempo: marca onde começou a conversa nova.
    if (lastConv && m.conversation_id !== lastConv.id) items.push({ kind: "event", id: `conv-${m.conversation_id}`, text: `Voltou a conversar depois de ${gapLabel(at.getTime() - lastConv.at)}` });
    lastConv = { id: m.conversation_id, at: at.getTime() };
    const key = dayKey(at);
    if (key !== lastDay) {
      items.push({ kind: "day", id: `day-${key}`, label: formatDayLabel(at) });
      lastDay = key;
    }
    const author = m.sender === "human" ? (typeof meta.author === "string" && meta.author ? meta.author : meta.via === "painel" ? "Equipe" : "Pelo celular") : null;
    const media = mediaOf(m, meta);
    const item: Extract<InboxThreadItem, { kind: "message" }> = {
      kind: "message",
      id: m.id,
      sender: m.sender,
      author,
      body: media ? captionOf(m, media) : bubbleBody(m),
      media,
      transcript: media?.kind === "audio" ? m.transcript?.trim() || null : null,
      time: formatTime(at),
      meta: null,
      offHours: meta.offHours === true,
    };
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
  const loaded = await load(scope, id);
  const { num, contact } = loaded;
  assertCanSend(loaded);
  const res = await (await evolutionFor(num)).sendText(num.instanceName, { number: contact.phone ?? contact.jid.split("@")[0], text: body });
  await afterTeamSend(loaded, res.messageId, { type: "text", text: body, meta: { via: "painel", author } });
}

export type OutgoingFile = { data: Buffer; mime: string; name: string };

/** Tipo de mensagem do WhatsApp para o arquivo. Formatos que o WhatsApp não mostra como foto/vídeo vão como documento. */
function mediaKindFor(mime: string): "image" | "video" | "audio" | "document" {
  if (/^image\/(jpeg|png|webp)$/.test(mime)) return "image";
  if (/^video\/(mp4|3gpp)$/.test(mime)) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Arquivo ou áudio enviado pelo painel. Mesma regra da resposta em texto (o bot
 * pausa). Áudio sempre vai como mensagem de voz — é como a pessoa espera
 * receber no WhatsApp. O arquivo não fica guardado aqui: só o endereço para
 * buscá-lo de volta no WhatsApp (ver media-ref.ts).
 */
export async function sendInboxMedia(scope: InboxScope, id: string, file: OutgoingFile, opts: { caption?: string }, author: string): Promise<void> {
  if (!file.data.length) throw new Error("Arquivo vazio.");
  if (file.data.length > MEDIA_MAX_BYTES) throw new Error("Arquivo grande demais: o limite é 16 MB.");
  const caption = opts.caption?.trim().slice(0, 1000) || undefined;
  const loaded = await load(scope, id);
  const { num, contact } = loaded;
  assertCanSend(loaded);

  const client = await evolutionFor(num);
  const number = contact.phone ?? contact.jid.split("@")[0];
  const base64 = file.data.toString("base64");
  const kind = mediaKindFor(file.mime);
  const res =
    kind === "audio"
      ? await client.sendAudio(num.instanceName, { number, audio: base64 })
      : await client.sendMedia(num.instanceName, { number, mediaType: kind, media: base64, mimeType: file.mime, caption, fileName: kind === "document" ? file.name : undefined });
  const media = mediaRefFrom(res.raw);
  await afterTeamSend(loaded, res.messageId, {
    type: kind,
    // Documento sem legenda: o nome do arquivo vira o texto (busca e prévia da lista).
    text: caption ?? (kind === "document" ? file.name : null),
    mediaMime: file.mime,
    meta: { via: "painel", author, ...(media ? { media } : {}), ...(kind === "document" ? { fileName: file.name } : {}) },
  });
}

function assertCanSend({ num, contact }: Loaded): void {
  if (num.status !== "open") throw new Error("O WhatsApp deste número está desconectado. Reconecte para enviar mensagens.");
  if (contact.is_blocked) throw new Error("Este contato está bloqueado.");
}

async function evolutionFor(num: ScopeNumber) {
  const db = await getDb();
  const [node] = await db.select().from(schema.evolutionNodes).where(eq(schema.evolutionNodes.id, num.nodeId)).limit(1);
  if (!node) throw new Error("Servidor do WhatsApp não encontrado.");
  return getEvolutionClient(node);
}

/** Tudo o que acontece depois de a equipe enviar algo pelo painel: registrar, pausar o bot, reabrir. */
async function afterTeamSend({ store, conversation, contact, num }: Loaded, messageId: string, msg: { type: string; text: string | null; mediaMime?: string; meta: Record<string, unknown> }): Promise<void> {
  // Sem isto, o eco da própria mensagem (fromMe) seria lido como "respondeu pelo celular".
  markSent(num.id, messageId);
  getScheduler().cancel(`${num.id}:${contact.jid}`);
  const now = new Date();
  await store.insertMessage({ numberId: num.id, conversationId: conversation.id, contactId: contact.id, externalId: messageId || null, direction: "out", sender: "human", type: msg.type, text: msg.text, mediaMime: msg.mediaMime ?? null, meta: msg.meta });
  await store.bumpDailyStat(num.id, now, { messages_out: 1, human_messages: 1 });
  const pauseHours = pauseHoursFor(num);
  if (pauseHours > 0 && !contact.bot_disabled) await store.pauseContactBot(contact.id, new Date(now.getTime() + pauseHours * 3600_000));
  await store.setConversationStatus(conversation.id, "human", false, "Respondido pelo painel");
  if (conversation.resolved_at) await store.setConversationResolved(conversation.id, false);
  const db = await getDb();
  await db.update(schema.numbers).set({ lastMessageAt: now }).where(eq(schema.numbers.id, num.id));
}

/**
 * Baixa do WhatsApp (via Evolution) a mídia de uma mensagem, conferindo o
 * escopo pela conversa: um cliente não baixa arquivo de conversa de outro.
 * Mídia muito antiga pode não existir mais no WhatsApp — aí "não encontrada".
 */
export async function getInboxMedia(scope: InboxScope, messageId: string): Promise<{ data: Buffer; mime: string; fileName: string | null }> {
  if (!UUID_RE.test(messageId)) throw new MediaNotFound();
  const store = await getTenantStore(scope.accountId);
  const message = await store.getMessage(messageId);
  if (!message) throw new MediaNotFound();
  const { num } = await load(scope, message.conversation_id).catch(() => {
    throw new MediaNotFound();
  });
  const meta = metaOf(message);
  if (!isMediaRef(meta.media)) throw new MediaNotFound();
  const got = await (await evolutionFor(num)).getMedia(num.instanceName, meta.media, { audioAsMp4: message.type === "audio" }).catch(() => null);
  if (!got?.base64) throw new MediaNotFound();
  return { data: Buffer.from(got.base64, "base64"), mime: got.mimeType || message.media_mime || "application/octet-stream", fileName: typeof meta.fileName === "string" ? meta.fileName : null };
}

export class MediaNotFound extends Error {
  constructor() {
    super("Mídia não encontrada.");
  }
}

export async function saveInboxNotes(scope: InboxScope, id: string, notes: string): Promise<void> {
  const { store, contact } = await load(scope, id);
  const clean = notes.trim().slice(0, 4000) || null;
  await store.setContactNotes(contact.id, clean);
  // As notas moram no lead (a pessoa, não o número); o contato guarda uma cópia.
  if (contact.lead_id) await store.updateLead(contact.lead_id, { notes: clean });
}

/** Move a pessoa da conversa de etapa no funil do cliente dono do número. */
export async function setInboxLeadStage(scope: InboxScope, id: string, stageId: string, extras: { appointmentAt?: string; lostReason?: string }, actor: string): Promise<void> {
  const { contact, num } = await load(scope, id);
  if (!num.clientId || !contact.lead_id) throw new Error("Este número não tem cliente, então a pessoa não está em nenhum funil.");
  await moveLeadTo({ accountId: scope.accountId, clientId: num.clientId, staff: scope.staff }, contact.lead_id, stageId, extras, actor);
}

export async function renameInboxContact(scope: InboxScope, id: string, name: string): Promise<void> {
  const { store, contact } = await load(scope, id);
  await store.setContactName(contact.id, name.trim().slice(0, 80) || null);
}

export async function setInboxBlocked(scope: InboxScope, id: string, blocked: boolean): Promise<void> {
  const { store, contact } = await load(scope, id);
  await store.setContactBlocked(contact.id, blocked);
}

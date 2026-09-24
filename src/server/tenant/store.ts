import "server-only";
import type { SqlExecutor } from "./executor";
import { dayKey } from "@/lib/utils";
import type { StageKind } from "@/shared/crm-templates";

/**
 * Operações sobre o banco do aluno (schema "chatbot").
 * SQL puro, compatível com PGlite (dev) e Postgres/Supabase (produção).
 */

export type Contact = {
  id: string;
  number_id: string;
  jid: string;
  phone: string | null;
  name: string | null;
  push_name: string | null;
  is_blocked: boolean;
  bot_paused_until: Date | null;
  /** Bot desligado à mão nesta conversa, sem prazo para voltar. */
  bot_disabled: boolean;
  /** Notas internas da equipe sobre o contato. */
  notes: string | null;
  /** Lead (CRM) desta pessoa, se o número tem cliente. */
  lead_id: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
};

export type CrmStage = { id: string; client_id: string; name: string; kind: StageKind; position: number; asks_date: boolean; created_at: Date };

export type Lead = {
  id: string;
  client_id: string;
  phone: string;
  name: string | null;
  stage_id: string | null;
  interest: string | null;
  value_cents: number | null;
  notes: string | null;
  next_action_at: Date | null;
  next_action_note: string | null;
  appointment_at: Date | null;
  lost_reason: string | null;
  source: string | null;
  last_contact_id: string | null;
  last_inbound_at: Date | null;
  last_outbound_at: Date | null;
  created_at: Date;
  stage_changed_at: Date;
  closed_at: Date | null;
};

/** Lead com a conversa mais recente (para o cartão do quadro e da tela "Hoje"). */
export type LeadCardRow = Lead & { conversation_id: string | null; conv_category: string | null; conv_suggested: string | null; stage_total?: number | string; stage_value?: number | string };

export type TodayBucket = "agenda" | "retorno" | "aguardando" | "esfriando";

export type LeadEvent = { id: string; lead_id: string; type: string; from_stage: string | null; to_stage: string | null; actor: string | null; data: Record<string, unknown> | null; created_at: Date };

export type ConversationListRow = Conversation & {
  contact_phone: string | null;
  contact_name: string | null;
  contact_push_name: string | null;
  contact_is_blocked: boolean;
  contact_bot_disabled: boolean;
  contact_bot_paused_until: Date | null;
};

export type Conversation = {
  id: string;
  number_id: string;
  contact_id: string;
  status: "open" | "human" | "closed";
  needs_human: boolean;
  handoff_reason: string | null;
  last_message_at: Date;
  last_message_preview: string | null;
  message_count: number;
  bot_message_count: number;
  human_message_count: number;
  summary: string | null;
  category: string | null;
  /** Categoria sugerida pelo bot; `category` é a que uma pessoa confirmou. */
  suggested_category: string | null;
  created_at: Date;
  closed_at: Date | null;
  /** Marcação de CRM (aberto/finalizado), separada do status técnico do atendimento. */
  resolved_at: Date | null;
};

export type MessageRow = {
  id: string;
  number_id: string;
  conversation_id: string;
  contact_id: string;
  external_id: string | null;
  direction: "in" | "out";
  sender: "contact" | "bot" | "human" | "system";
  type: string;
  text: string | null;
  transcript: string | null;
  media_mime: string | null;
  status: string;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  meta: Record<string, unknown> | null;
  created_at: Date;
};

export type NewMessage = {
  numberId: string;
  conversationId: string;
  contactId: string;
  externalId?: string | null;
  direction: "in" | "out";
  sender: "contact" | "bot" | "human" | "system";
  type?: string;
  text?: string | null;
  transcript?: string | null;
  mediaMime?: string | null;
  status?: string;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number | null;
  meta?: Record<string, unknown> | null;
  createdAt?: Date;
};

export type DailyStat = {
  day: string;
  conversations: number;
  messages_in: number;
  messages_out: number;
  bot_messages: number;
  human_messages: number;
  new_contacts: number;
  handoffs: number;
  tokens_in: number;
  tokens_out: number;
};

/** Prévia da conversa na lista para mensagens de mídia. */
const PREVIEW_LABELS: Record<string, string> = {
  image: "📷 Foto",
  video: "🎬 Vídeo",
  audio: "🎤 Áudio",
  document: "📄 Documento",
  sticker: "Figurinha",
  location: "📍 Localização",
};

/**
 * Só a conversa mais recente de cada contato: quem volta aparece uma vez na
 * lista, com o histórico inteiro dentro (as conversas não são mais apagadas).
 */
const latestPerContact = (alias: string) => `not exists (select 1 from chatbot.conversations newer where newer.contact_id = ${alias}.contact_id and newer.created_at > ${alias}.created_at)`;

/** Categoria que vale: a confirmada por uma pessoa ou, na falta dela, a sugerida pelo bot. */
const EFFECTIVE_CATEGORY = "coalesce(category, suggested_category)";

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}

function vec(embedding: number[]): string {
  return "[" + embedding.join(",") + "]";
}

export class TenantStore {
  constructor(private readonly db: SqlExecutor) {}

  // ---------------------------------------------------------------- contatos

  async upsertContact(input: { numberId: string; jid: string; phone?: string | null; pushName?: string | null }): Promise<Contact> {
    const rows = await this.db.query<Contact>(
      `insert into chatbot.contacts (number_id, jid, phone, push_name)
       values ($1, $2, $3, $4)
       on conflict (number_id, jid) do update
         set last_seen_at = now(),
             push_name = coalesce(excluded.push_name, chatbot.contacts.push_name),
             phone = coalesce(excluded.phone, chatbot.contacts.phone)
       returning *`,
      [input.numberId, input.jid, input.phone ?? null, input.pushName ?? null],
    );
    return rows[0];
  }

  async getContact(id: string): Promise<Contact | null> {
    const rows = await this.db.query<Contact>(`select * from chatbot.contacts where id = $1`, [id]);
    return rows[0] ?? null;
  }

  async pauseContactBot(contactId: string, until: Date | null): Promise<void> {
    await this.db.query(`update chatbot.contacts set bot_paused_until = $2 where id = $1`, [contactId, until]);
  }

  async setContactBlocked(contactId: string, blocked: boolean): Promise<void> {
    await this.db.query(`update chatbot.contacts set is_blocked = $2 where id = $1`, [contactId, blocked]);
  }

  async setContactName(contactId: string, name: string | null): Promise<void> {
    await this.db.query(`update chatbot.contacts set name = $2 where id = $1`, [contactId, name]);
  }

  async setContactBotDisabled(contactId: string, disabled: boolean): Promise<void> {
    await this.db.query(`update chatbot.contacts set bot_disabled = $2 where id = $1`, [contactId, disabled]);
  }

  /** Religa o bot para o contato: tira o desligamento manual e qualquer pausa automática. */
  async resumeContactBot(contactId: string): Promise<void> {
    await this.db.query(`update chatbot.contacts set bot_disabled = false, bot_paused_until = null where id = $1`, [contactId]);
  }

  async setContactNotes(contactId: string, notes: string | null): Promise<void> {
    await this.db.query(`update chatbot.contacts set notes = $2 where id = $1`, [contactId, notes]);
  }

  // ------------------------------------------------------------- conversas

  /** Conversa aberta do contato, ou uma nova se a última passou do timeout. */
  async getOrCreateConversation(input: { numberId: string; contactId: string; timeoutHours: number }): Promise<{ conversation: Conversation; created: boolean }> {
    const rows = await this.db.query<Conversation>(
      `select * from chatbot.conversations
       where contact_id = $1 and status <> 'closed'
       order by last_message_at desc limit 1`,
      [input.contactId],
    );
    const last = rows[0];
    if (last) {
      const ageMs = Date.now() - toDate(last.last_message_at).getTime();
      if (ageMs < input.timeoutHours * 3600_000) return { conversation: last, created: false };
      await this.db.query(`update chatbot.conversations set status = 'closed', closed_at = now() where id = $1`, [last.id]);
    }
    const created = await this.db.query<Conversation>(
      `insert into chatbot.conversations (number_id, contact_id) values ($1, $2) returning *`,
      [input.numberId, input.contactId],
    );
    return { conversation: created[0], created: true };
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const rows = await this.db.query<Conversation>(`select * from chatbot.conversations where id = $1`, [id]);
    return rows[0] ?? null;
  }

  async setConversationStatus(id: string, status: Conversation["status"], needsHuman: boolean, reason?: string | null): Promise<void> {
    await this.db.query(
      `update chatbot.conversations
         set status = $2, needs_human = $3, handoff_reason = coalesce($4, handoff_reason),
             closed_at = case when $2 = 'closed' then now() else closed_at end
       where id = $1`,
      [id, status, needsHuman, reason ?? null],
    );
  }

  /** `null` limpa a categoria (útil para corrigir um erro do bot na mão). */
  async setConversationCategory(id: string, category: string | null): Promise<void> {
    await this.db.query(`update chatbot.conversations set category = $2 where id = $1`, [id, category]);
  }

  /** Sugestão do bot. Nunca mexe na categoria que uma pessoa confirmou. */
  async setSuggestedCategory(id: string, category: string | null): Promise<void> {
    await this.db.query(`update chatbot.conversations set suggested_category = $2 where id = $1`, [id, category]);
  }

  /** Marca (ou desmarca) a conversa como finalizada — gestão de CRM, à mão. Finalizar também tira o "precisa de você". */
  async setConversationResolved(id: string, resolved: boolean): Promise<void> {
    await this.db.query(
      `update chatbot.conversations
         set resolved_at = case when $2 then now() else null end,
             needs_human = case when $2 then false else needs_human end
       where id = $1`,
      [id, resolved],
    );
  }

  /** Categorias em uso entre os números informados, para alimentar o filtro da lista. */
  async listCategoriesInUse(numberIds: string[]): Promise<string[]> {
    if (!numberIds.length) return [];
    const rows = await this.db.query<{ category: string }>(
      `select distinct ${EFFECTIVE_CATEGORY} as category from chatbot.conversations where number_id = any($1::uuid[]) and ${EFFECTIVE_CATEGORY} is not null order by 1`,
      [numberIds],
    );
    return rows.map((r) => r.category);
  }

  async listConversations(input: { numberId?: string; numberIds?: string[]; needsHuman?: boolean; category?: string; resolved?: boolean; search?: string; limit?: number; offset?: number }): Promise<ConversationListRow[]> {
    const where: string[] = [latestPerContact("c")];
    const params: unknown[] = [];
    if (input.numberId) {
      params.push(input.numberId);
      where.push(`c.number_id = $${params.length}`);
    } else if (input.numberIds && input.numberIds.length) {
      params.push(input.numberIds);
      where.push(`c.number_id = any($${params.length}::uuid[])`);
    }
    if (input.needsHuman) where.push(`c.needs_human = true`);
    if (input.category) {
      params.push(input.category);
      where.push(`coalesce(c.category, c.suggested_category) = $${params.length}`);
    }
    if (input.resolved !== undefined) where.push(input.resolved ? `c.resolved_at is not null` : `c.resolved_at is null`);
    const search = input.search?.trim();
    if (search) {
      params.push(`%${search.replace(/[\\%_]/g, (m) => "\\" + m)}%`);
      const textParam = `$${params.length}`;
      const conds = [`ct.name ilike ${textParam}`, `ct.push_name ilike ${textParam}`, `c.last_message_preview ilike ${textParam}`, `coalesce(c.category, c.suggested_category) ilike ${textParam}`];
      const digits = search.replace(/\D/g, "");
      if (digits.length >= 3) {
        params.push(`%${digits}%`);
        conds.push(`ct.phone like $${params.length}`);
      }
      where.push(`(${conds.join(" or ")})`);
    }
    params.push(input.limit ?? 50);
    const limitIdx = params.length;
    params.push(input.offset ?? 0);
    const offsetIdx = params.length;
    return this.db.query(
      `select c.*, ct.phone as contact_phone, ct.name as contact_name, ct.push_name as contact_push_name,
              ct.is_blocked as contact_is_blocked, ct.bot_disabled as contact_bot_disabled, ct.bot_paused_until as contact_bot_paused_until
       from chatbot.conversations c
       join chatbot.contacts ct on ct.id = c.contact_id
       where ${where.join(" and ")}
       order by c.last_message_at desc
       limit $${limitIdx} offset $${offsetIdx}`,
      params,
    );
  }

  /** Contagem simples (aberto/finalizado, opcionalmente só quem teve atividade recente). */
  async countConversations(input: { numberIds: string[]; resolved?: boolean; needsHuman?: boolean; activeSince?: Date }): Promise<number> {
    if (!input.numberIds.length) return 0;
    const where: string[] = [`c.number_id = any($1::uuid[])`, latestPerContact("c")];
    const params: unknown[] = [input.numberIds];
    if (input.resolved !== undefined) where.push(input.resolved ? `c.resolved_at is not null` : `c.resolved_at is null`);
    if (input.needsHuman) where.push(`c.needs_human = true`);
    if (input.activeSince) {
      params.push(input.activeSince);
      where.push(`c.last_message_at >= $${params.length}`);
    }
    const rows = await this.db.query<{ n: number | string }>(`select count(*) as n from chatbot.conversations c where ${where.join(" and ")}`, params);
    return Number(rows[0]?.n ?? 0);
  }

  /** Quantas conversas em aberto por categoria — alimenta o painel de métricas leve do portal. */
  async categoryBreakdown(input: { numberIds: string[]; resolved?: boolean }): Promise<{ category: string; n: number }[]> {
    if (!input.numberIds.length) return [];
    const where: string[] = [`number_id = any($1::uuid[])`, `${EFFECTIVE_CATEGORY} is not null`];
    const params: unknown[] = [input.numberIds];
    if (input.resolved !== undefined) where.push(input.resolved ? `resolved_at is not null` : `resolved_at is null`);
    const rows = await this.db.query<{ category: string; n: number | string }>(
      `select ${EFFECTIVE_CATEGORY} as category, count(*) as n from chatbot.conversations where ${where.join(" and ")} group by 1 order by n desc`,
      params,
    );
    return rows.map((r) => ({ category: r.category, n: Number(r.n) }));
  }

  // ------------------------------------------------------------- mensagens

  async messageExists(numberId: string, externalId: string): Promise<boolean> {
    const rows = await this.db.query<{ one: number }>(
      `select 1 as one from chatbot.messages where number_id = $1 and external_id = $2 limit 1`,
      [numberId, externalId],
    );
    return rows.length > 0;
  }

  async insertMessage(m: NewMessage): Promise<MessageRow | null> {
    const rows = await this.db.query<MessageRow>(
      `insert into chatbot.messages
         (number_id, conversation_id, contact_id, external_id, direction, sender, type, text, transcript, media_mime, status, model, tokens_in, tokens_out, latency_ms, meta, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, coalesce($17, now()))
       on conflict do nothing
       returning *`,
      [
        m.numberId,
        m.conversationId,
        m.contactId,
        m.externalId ?? null,
        m.direction,
        m.sender,
        m.type ?? "text",
        m.text ?? null,
        m.transcript ?? null,
        m.mediaMime ?? null,
        m.status ?? (m.direction === "in" ? "received" : "sent"),
        m.model ?? null,
        m.tokensIn ?? null,
        m.tokensOut ?? null,
        m.latencyMs ?? null,
        m.meta ? JSON.stringify(m.meta) : null,
        m.createdAt ?? null,
      ],
    );
    const row = rows[0] ?? null;
    // Mensagens "system" são marcações internas (telemetria da rodada do bot: modelo,
    // tokens, ferramentas usadas) — não fazem parte da conversa visível, então não
    // devem virar a prévia nem contar em message_count.
    if (row && m.sender !== "system") {
      const label = PREVIEW_LABELS[m.type ?? "text"];
      const body = m.text ?? m.transcript ?? null;
      const preview = (label ? (body ? `${label} · ${body}` : label) : body ?? "[mensagem]").slice(0, 120);
      await this.db.query(
        `update chatbot.conversations
           set last_message_at = greatest(last_message_at, $2::timestamptz),
               last_message_preview = $3,
               message_count = message_count + 1,
               bot_message_count = bot_message_count + case when $4 = 'bot' then 1 else 0 end,
               human_message_count = human_message_count + case when $4 = 'human' then 1 else 0 end
         where id = $1`,
        [m.conversationId, toDate(row.created_at), preview, m.sender],
      );
      // O lead guarda quem falou por último ("aguardando vocês" / "sem resposta dele").
      await this.db.query(
        `update chatbot.leads set
           last_inbound_at = case when $2 = 'in' then greatest(coalesce(last_inbound_at, $3), $3) else last_inbound_at end,
           last_outbound_at = case when $2 = 'out' then greatest(coalesce(last_outbound_at, $3), $3) else last_outbound_at end
         where id = (select lead_id from chatbot.contacts where id = $1)`,
        [m.contactId, m.direction, toDate(row.created_at)],
      );
    }
    return row;
  }

  /** Histórico da pessoa com este número, atravessando as conversas (para quem atende ver o retorno). */
  async listContactMessages(contactId: string, limit = 300): Promise<MessageRow[]> {
    return this.db.query<MessageRow>(
      `select * from (
         select * from chatbot.messages where contact_id = $1
         order by created_at desc, id desc limit $2
       ) t order by created_at asc, id asc`,
      [contactId, limit],
    );
  }

  async getMessage(id: string): Promise<MessageRow | null> {
    const rows = await this.db.query<MessageRow>(`select * from chatbot.messages where id = $1`, [id]);
    return rows[0] ?? null;
  }

  /** Junta campos ao `meta` de uma mensagem (ex.: o endereço da mídia que chega no eco do envio). */
  async mergeMessageMeta(numberId: string, externalId: string, patch: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `update chatbot.messages set meta = coalesce(meta, '{}'::jsonb) || $3::jsonb where number_id = $1 and external_id = $2`,
      [numberId, externalId, JSON.stringify(patch)],
    );
  }

  /** As últimas `limit` mensagens da conversa, em ordem cronológica. */
  async listMessages(conversationId: string, limit = 200): Promise<MessageRow[]> {
    return this.db.query<MessageRow>(
      `select * from (
         select * from chatbot.messages where conversation_id = $1
         order by created_at desc, id desc limit $2
       ) t order by created_at asc, id asc`,
      [conversationId, limit],
    );
  }

  /** Últimas N mensagens (ordem cronológica) para montar o contexto do modelo. */
  async recentMessages(conversationId: string, limit: number): Promise<MessageRow[]> {
    const rows = await this.db.query<MessageRow>(
      `select * from (
         select * from chatbot.messages where conversation_id = $1 and status <> 'ignored'
         order by created_at desc, id desc limit $2
       ) t order by created_at asc, id asc`,
      [conversationId, limit],
    );
    return rows;
  }

  // ------------------------------------------------------------ conhecimento

  async replaceChunks(input: { botId: string; itemId: string; chunks: { content: string; embedding: number[] | null }[] }): Promise<void> {
    await this.db.query(`delete from chatbot.kb_chunks where item_id = $1`, [input.itemId]);
    let ord = 0;
    for (const c of input.chunks) {
      await this.db.query(
        `insert into chatbot.kb_chunks (bot_id, item_id, ord, content, embedding) values ($1, $2, $3, $4, $5::vector)`,
        [input.botId, input.itemId, ord++, c.content, c.embedding ? vec(c.embedding) : null],
      );
    }
  }

  async deleteChunks(itemId: string): Promise<void> {
    await this.db.query(`delete from chatbot.kb_chunks where item_id = $1`, [itemId]);
  }

  async deleteBotChunks(botId: string): Promise<void> {
    await this.db.query(`delete from chatbot.kb_chunks where bot_id = $1`, [botId]);
  }

  async searchChunks(botId: string, embedding: number[], limit: number): Promise<{ id: string; item_id: string; content: string; distance: number }[]> {
    return this.db.query(
      `select id, item_id, content, (embedding <=> $2::vector) as distance
       from chatbot.kb_chunks
       where bot_id = $1 and embedding is not null
       order by embedding <=> $2::vector
       limit $3`,
      [botId, vec(embedding), limit],
    );
  }

  /** Fallback sem embeddings: busca textual simples (dev sem chave OpenAI). */
  async searchChunksByText(botId: string, query: string, limit: number): Promise<{ id: string; item_id: string; content: string; distance: number }[]> {
    const words = query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 4)
      .slice(0, 8);
    if (!words.length) return [];
    const params: unknown[] = [botId];
    const scores = words.map((w) => {
      params.push(`%${w}%`);
      return `(case when lower(content) like $${params.length} then 1 else 0 end)`;
    });
    params.push(limit);
    return this.db.query(
      `select id, item_id, content, (1.0 - (${scores.join(" + ")})::float / ${words.length}) as distance
       from chatbot.kb_chunks
       where bot_id = $1 and (${scores.join(" + ")}) > 0
       order by distance asc
       limit $${params.length}`,
      params,
    );
  }

  // ------------------------------------------------------------ estatísticas

  async bumpDailyStat(numberId: string, day: Date, delta: Partial<Record<keyof Omit<DailyStat, "day">, number>>): Promise<void> {
    const cols = Object.keys(delta) as (keyof typeof delta)[];
    if (!cols.length) return;
    // O "dia" é o do fuso de exibição: conversa das 22h de Brasília conta no mesmo dia, não no seguinte.
    const params: unknown[] = [numberId, dayKey(day)];
    const insertCols = cols.map((c) => c).join(", ");
    const insertVals = cols
      .map((c) => {
        params.push(delta[c] ?? 0);
        return `$${params.length}`;
      })
      .join(", ");
    const updates = cols
      .map((c, i) => `${c} = chatbot.daily_stats.${c} + $${3 + i}`)
      .join(", ");
    await this.db.query(
      `insert into chatbot.daily_stats (number_id, day, ${insertCols}) values ($1, $2::date, ${insertVals})
       on conflict (number_id, day) do update set ${updates}`,
      params,
    );
  }

  /** Dias como Date (vira o dia no fuso de exibição) ou já em "AAAA-MM-DD". */
  async dailyStats(numberIds: string[], fromDay: Date | string, toDay: Date | string): Promise<(DailyStat & { number_id: string })[]> {
    if (!numberIds.length) return [];
    const rows = await this.db.query<(DailyStat & { number_id: string; day: unknown })>(
      `select number_id, day::text as day, conversations, messages_in, messages_out, bot_messages, human_messages, new_contacts, handoffs, tokens_in::int as tokens_in, tokens_out::int as tokens_out
       from chatbot.daily_stats
       where number_id = any($1::uuid[]) and day between $2::date and $3::date
       order by day asc`,
      [numberIds, typeof fromDay === "string" ? fromDay : dayKey(fromDay), typeof toDay === "string" ? toDay : dayKey(toDay)],
    );
    return rows.map((r) => ({ ...r, day: String(r.day).slice(0, 10) }));
  }

  async countOpenNeedsHuman(numberIds: string[]): Promise<number> {
    if (!numberIds.length) return 0;
    const rows = await this.db.query<{ n: number | string }>(
      `select count(*) as n from chatbot.conversations where number_id = any($1::uuid[]) and needs_human = true and status <> 'closed'`,
      [numberIds],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Números da tela de indicadores numa consulta só. "Em aberto" e "aguardando"
   * são o retrato de agora (sem corte de período); o resto conta a partir de `since`.
   * "Só o bot" = conversa que começou no período sem nenhuma mensagem da equipe
   * nem passagem para humano (`handoff_reason` fica nulo).
   */
  async indicatorSummary(numberIds: string[], since: Date): Promise<{ started: number; openNow: number; waitingNow: number; resolved: number; botOnly: number }> {
    if (!numberIds.length) return { started: 0, openNow: 0, waitingNow: 0, resolved: 0, botOnly: 0 };
    const rows = await this.db.query<Record<string, number | string>>(
      `select
         count(*) filter (where created_at >= $2) as started,
         count(*) filter (where latest and resolved_at is null) as open_now,
         count(*) filter (where latest and resolved_at is null and needs_human) as waiting_now,
         count(*) filter (where resolved_at >= $2) as resolved,
         count(*) filter (where created_at >= $2 and human_message_count = 0 and handoff_reason is null) as bot_only
       from (select c.*, ${latestPerContact("c")} as latest from chatbot.conversations c where c.number_id = any($1::uuid[])) t`,
      [numberIds, since],
    );
    const r = rows[0] ?? {};
    return { started: Number(r.started ?? 0), openNow: Number(r.open_now ?? 0), waitingNow: Number(r.waiting_now ?? 0), resolved: Number(r.resolved ?? 0), botOnly: Number(r.bot_only ?? 0) };
  }

  /** Conversas com atividade no período, por categoria ("" = sem categoria). */
  async categoryCountsSince(numberIds: string[], since: Date): Promise<{ category: string; n: number }[]> {
    if (!numberIds.length) return [];
    const rows = await this.db.query<{ category: string; n: number | string }>(
      `select coalesce(category, suggested_category, '') as category, count(*) as n
       from chatbot.conversations
       where number_id = any($1::uuid[]) and last_message_at >= $2
       group by 1 order by 2 desc`,
      [numberIds, since],
    );
    return rows.map((r) => ({ category: r.category, n: Number(r.n) }));
  }

  /** Mensagens recebidas por hora do dia, em UTC (quem chama converte para o fuso de exibição). */
  async inboundByHourUtc(numberIds: string[], since: Date): Promise<{ hour: number; n: number }[]> {
    if (!numberIds.length) return [];
    const rows = await this.db.query<{ hour: number | string; n: number | string }>(
      `select extract(hour from created_at at time zone 'UTC')::int as hour, count(*) as n
       from chatbot.messages
       where number_id = any($1::uuid[]) and direction = 'in' and created_at >= $2
       group by 1`,
      [numberIds, since],
    );
    return rows.map((r) => ({ hour: Number(r.hour), n: Number(r.n) }));
  }

  async contactsCount(numberIds: string[]): Promise<number> {
    if (!numberIds.length) return 0;
    const rows = await this.db.query<{ n: number | string }>(`select count(*) as n from chatbot.contacts where number_id = any($1::uuid[])`, [numberIds]);
    return Number(rows[0]?.n ?? 0);
  }

  // ------------------------------------------------------------------ CRM

  async listStages(clientId: string): Promise<CrmStage[]> {
    return this.db.query<CrmStage>(`select * from chatbot.crm_stages where client_id = $1 order by position, created_at`, [clientId]);
  }

  async insertStages(clientId: string, stages: { name: string; kind: StageKind; asksDate?: boolean }[]): Promise<void> {
    for (const [i, st] of stages.entries()) {
      await this.db.query(`insert into chatbot.crm_stages (client_id, name, kind, position, asks_date) values ($1, $2, $3, $4, $5)`, [clientId, st.name, st.kind, i, st.asksDate === true]);
    }
  }

  /**
   * Grava o funil editado: atualiza as etapas que continuam, cria as novas e
   * apaga as removidas. Os leads de uma etapa removida vão para a primeira
   * etapa em andamento do funil novo.
   */
  async saveStages(clientId: string, stages: { id?: string; name: string; kind: StageKind; asksDate: boolean }[]): Promise<void> {
    const current = await this.listStages(clientId);
    const ids: string[] = [];
    for (const [i, st] of stages.entries()) {
      if (st.id && current.some((c) => c.id === st.id)) {
        await this.db.query(`update chatbot.crm_stages set name = $3, kind = $4, position = $5, asks_date = $6 where id = $1 and client_id = $2`, [st.id, clientId, st.name, st.kind, i, st.asksDate]);
        ids.push(st.id);
      } else {
        const rows = await this.db.query<{ id: string }>(`insert into chatbot.crm_stages (client_id, name, kind, position, asks_date) values ($1, $2, $3, $4, $5) returning id`, [clientId, st.name, st.kind, i, st.asksDate]);
        ids.push(rows[0].id);
      }
    }
    const entry = ids[stages.findIndex((s) => s.kind === "open")] ?? null;
    for (const old of current) {
      if (ids.includes(old.id)) continue;
      await this.db.query(`update chatbot.leads set stage_id = $2, stage_changed_at = now(), closed_at = null where stage_id = $1`, [old.id, entry]);
      await this.db.query(`delete from chatbot.crm_stages where id = $1 and client_id = $2`, [old.id, clientId]);
    }
  }

  /**
   * Lead do contato: cria na etapa de entrada se ainda não existe lead com esse
   * telefone neste cliente, e liga o contato a ele. Um lead que já existe só
   * ganha o contato mais recente e, se não tinha nome, o nome.
   */
  async touchLead(input: { clientId: string; phone: string; name: string | null; contactId: string; source: string | null; entryStageId: string | null; notes?: string | null; createdAt?: Date }): Promise<{ lead: Lead; created: boolean }> {
    const rows = await this.db.query<Lead & { inserted: boolean }>(
      `insert into chatbot.leads (client_id, phone, name, stage_id, source, last_contact_id, notes, created_at, stage_changed_at)
       values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, now()), coalesce($8, now()))
       on conflict (client_id, phone) do update
         set last_contact_id = excluded.last_contact_id,
             name = coalesce(chatbot.leads.name, excluded.name)
       returning *, (xmax = 0) as inserted`,
      [input.clientId, input.phone, input.name, input.entryStageId, input.source, input.contactId, input.notes ?? null, input.createdAt ?? null],
    );
    const { inserted, ...lead } = rows[0];
    await this.db.query(`update chatbot.contacts set lead_id = $2 where id = $1`, [input.contactId, lead.id]);
    if (inserted === true) await this.addLeadEvent(lead.id, { type: "created", toStage: input.entryStageId, actor: "sistema", createdAt: input.createdAt });
    return { lead, created: inserted === true };
  }

  /** Recalcula a última mensagem recebida/enviada dos leads (para leads criados a partir de conversas antigas). */
  async refreshLeadActivity(leadIds: string[]): Promise<void> {
    if (!leadIds.length) return;
    await this.db.query(
      `update chatbot.leads l set last_inbound_at = a.last_in, last_outbound_at = a.last_out
       from (
         select c.lead_id,
                max(m.created_at) filter (where m.direction = 'in') as last_in,
                max(m.created_at) filter (where m.direction = 'out') as last_out
         from chatbot.messages m join chatbot.contacts c on c.id = m.contact_id
         where c.lead_id = any($1::uuid[]) and m.sender <> 'system'
         group by c.lead_id
       ) a
       where l.id = a.lead_id`,
      [leadIds],
    );
  }

  /**
   * Importa de uma vez os contatos dos números do cliente que ainda não são
   * lead (conversas de antes do CRM). Em lote: uma instalação com milhares de
   * contatos não pode travar a primeira abertura do funil. Devolve os leads novos.
   */
  async importContactsAsLeads(clientId: string, entryStageId: string | null, numbers: { id: string; label: string }[]): Promise<string[]> {
    if (!numbers.length) return [];
    const ids = numbers.map((n) => n.id);
    const phone = `coalesce(c.phone, split_part(c.jid, '@', 1))`;
    const created = await this.db.query<{ id: string }>(
      `insert into chatbot.leads (client_id, phone, name, stage_id, source, last_contact_id, notes, created_at, stage_changed_at)
       select distinct on (${phone}) $1, ${phone}, coalesce(c.name, c.push_name), $2, u.label, c.id, c.notes, c.first_seen_at, c.first_seen_at
       from chatbot.contacts c join unnest($3::uuid[], $4::text[]) as u(id, label) on u.id = c.number_id
       where c.lead_id is null
       order by ${phone}, c.last_seen_at desc
       on conflict (client_id, phone) do nothing
       returning id`,
      [clientId, entryStageId, ids, numbers.map((n) => n.label)],
    );
    await this.db.query(
      `update chatbot.contacts c set lead_id = l.id from chatbot.leads l
       where c.number_id = any($2::uuid[]) and c.lead_id is null and l.client_id = $1 and l.phone = ${phone}`,
      [clientId, ids],
    );
    const newIds = created.map((r) => r.id);
    if (newIds.length) {
      await this.db.query(
        `insert into chatbot.lead_events (lead_id, type, to_stage, actor, created_at)
         select id, 'created', stage_id, 'sistema', created_at from chatbot.leads where id = any($1::uuid[])`,
        [newIds],
      );
    }
    return newIds;
  }

  /** Há contato sem lead nestes números? (checagem barata antes de importar) */
  async hasContactsWithoutLead(numberIds: string[]): Promise<boolean> {
    if (!numberIds.length) return false;
    const rows = await this.db.query(`select 1 from chatbot.contacts where number_id = any($1::uuid[]) and lead_id is null limit 1`, [numberIds]);
    return rows.length > 0;
  }

  /** Contatos dos números do cliente que ainda não viraram lead (conversas de antes do CRM). */
  async contactsWithoutLead(numberIds: string[]): Promise<Contact[]> {
    if (!numberIds.length) return [];
    return this.db.query<Contact>(`select * from chatbot.contacts where number_id = any($1::uuid[]) and lead_id is null order by first_seen_at`, [numberIds]);
  }

  async getLead(id: string): Promise<Lead | null> {
    const rows = await this.db.query<Lead>(`select * from chatbot.leads where id = $1`, [id]);
    return rows[0] ?? null;
  }

  async getLeadByContact(contactId: string): Promise<Lead | null> {
    const rows = await this.db.query<Lead>(`select l.* from chatbot.leads l join chatbot.contacts c on c.lead_id = l.id where c.id = $1`, [contactId]);
    return rows[0] ?? null;
  }

  /**
   * Leads do quadro: etapas abertas (até `perStage` por etapa, os mais recentes)
   * e etapas fechadas só com quem fechou desde `closedSince`. Traz junto a
   * categoria da conversa mais recente, para sugerir o interesse.
   */
  async boardLeads(clientId: string, opts: { closedSince: Date; perStage: number; search?: string; waiting?: boolean; coolingBefore?: Date }): Promise<LeadCardRow[]> {
    const params: unknown[] = [clientId, opts.closedSince, opts.perStage];
    const where: string[] = [`l.client_id = $1`, `(s.kind = 'open' or s.id is null or l.closed_at >= $2)`];
    const search = opts.search?.trim();
    if (search) {
      params.push(`%${search.replace(/[\\%_]/g, (m) => "\\" + m)}%`);
      const i = params.length;
      const conds = [`l.name ilike $${i}`, `l.interest ilike $${i}`, `l.notes ilike $${i}`];
      const digits = search.replace(/\D/g, "");
      if (digits.length >= 3) {
        params.push(`%${digits}%`);
        conds.push(`l.phone like $${params.length}`);
      }
      where.push(`(${conds.join(" or ")})`);
    }
    if (opts.waiting) where.push(`l.last_inbound_at is not null and l.last_inbound_at > coalesce(l.last_outbound_at, 'epoch')`);
    if (opts.coolingBefore) {
      params.push(opts.coolingBefore);
      where.push(`l.last_outbound_at is not null and l.last_outbound_at > coalesce(l.last_inbound_at, 'epoch') and l.last_outbound_at < $${params.length}`);
    }
    return this.db.query<LeadCardRow>(
      `select * from (
         select l.*, lc.id as conversation_id, lc.category as conv_category, lc.suggested_category as conv_suggested,
                row_number() over (partition by l.stage_id order by l.stage_changed_at desc) as rn,
                count(*) over (partition by l.stage_id) as stage_total,
                coalesce(sum(l.value_cents) over (partition by l.stage_id), 0) as stage_value
         from chatbot.leads l
         left join chatbot.crm_stages s on s.id = l.stage_id
         left join lateral (
           select id, category, suggested_category from chatbot.conversations
           where contact_id = l.last_contact_id order by last_message_at desc limit 1
         ) lc on true
         where ${where.join(" and ")}
       ) t where rn <= $3
       order by stage_changed_at desc`,
      params,
    );
  }

  /** Atualiza campos soltos do lead (valor, interesse, notas, próxima ação, agendamento, nome). */
  async updateLead(id: string, patch: Partial<Pick<Lead, "name" | "interest" | "value_cents" | "notes" | "next_action_at" | "next_action_note" | "appointment_at" | "lost_reason">>): Promise<void> {
    const cols = Object.keys(patch) as (keyof typeof patch)[];
    if (!cols.length) return;
    const params: unknown[] = [id];
    const sets = cols.map((c) => {
      params.push(patch[c] ?? null);
      return `${c} = $${params.length}`;
    });
    await this.db.query(`update chatbot.leads set ${sets.join(", ")} where id = $1`, params);
  }

  /** Move o lead de etapa e registra no histórico. Fechar (ganho/perda) marca a data; reabrir limpa. */
  async moveLead(id: string, to: CrmStage, opts: { actor: string; appointmentAt?: Date | null; lostReason?: string | null }): Promise<void> {
    const lead = await this.getLead(id);
    if (!lead || lead.stage_id === to.id) return;
    await this.db.query(
      `update chatbot.leads set stage_id = $2, stage_changed_at = now(),
         closed_at = case when $3 = 'open' then null else coalesce(closed_at, now()) end,
         lost_reason = case when $3 = 'lost' then $4 else null end,
         appointment_at = coalesce($5, appointment_at)
       where id = $1`,
      [id, to.id, to.kind, opts.lostReason ?? null, opts.appointmentAt ?? null],
    );
    const data: Record<string, unknown> = {};
    if (opts.appointmentAt) data.appointmentAt = opts.appointmentAt.toISOString();
    if (opts.lostReason) data.lostReason = opts.lostReason;
    await this.addLeadEvent(id, { type: "stage", fromStage: lead.stage_id, toStage: to.id, actor: opts.actor, data });
  }

  async addLeadEvent(leadId: string, e: { type: string; fromStage?: string | null; toStage?: string | null; actor: string; data?: Record<string, unknown>; createdAt?: Date }): Promise<void> {
    await this.db.query(
      `insert into chatbot.lead_events (lead_id, type, from_stage, to_stage, actor, data, created_at) values ($1, $2, $3, $4, $5, $6, coalesce($7, now()))`,
      [leadId, e.type, e.fromStage ?? null, e.toStage ?? null, e.actor, e.data && Object.keys(e.data).length ? JSON.stringify(e.data) : null, e.createdAt ?? null],
    );
  }

  async listLeadEvents(leadId: string, limit = 100): Promise<LeadEvent[]> {
    return this.db.query<LeadEvent>(`select * from chatbot.lead_events where lead_id = $1 order by created_at desc limit $2`, [leadId, limit]);
  }

  /**
   * O que a tela "Hoje" precisa, já separado: agendamentos do dia, retornos
   * vencidos ou de hoje, quem espera resposta e quem esfriou. Só leads em
   * etapas abertas (quem fechou não tem pendência).
   */
  async todayLeads(clientId: string, dayStart: Date, dayEnd: Date, coolingBefore: Date): Promise<(LeadCardRow & { bucket: TodayBucket })[]> {
    return this.db.query(
      `select * from (
         select l.*, lc.id as conversation_id, lc.category as conv_category, lc.suggested_category as conv_suggested,
                case
                  when l.appointment_at >= $2 and l.appointment_at < $3 then 'agenda'
                  when l.next_action_at is not null and l.next_action_at < $3 then 'retorno'
                  when l.last_inbound_at is not null and l.last_inbound_at > coalesce(l.last_outbound_at, 'epoch') then 'aguardando'
                  when l.last_outbound_at < $4 and l.last_outbound_at > coalesce(l.last_inbound_at, 'epoch') then 'esfriando'
                end as bucket
         from chatbot.leads l
         left join chatbot.crm_stages s on s.id = l.stage_id
         left join lateral (
           select id, category, suggested_category from chatbot.conversations
           where contact_id = l.last_contact_id order by last_message_at desc limit 1
         ) lc on true
         where l.client_id = $1 and (s.kind = 'open' or s.id is null)
       ) t
       where bucket is not null
       order by coalesce(appointment_at, next_action_at, last_inbound_at, last_outbound_at) asc
       limit 300`,
      [clientId, dayStart, dayEnd, coolingBefore],
    );
  }

  /** Leads que chegaram no período e as mudanças de etapa deles (o funil é montado no serviço). */
  async funnelData(clientId: string, since: Date, until: Date): Promise<{ leads: Lead[]; moves: { lead_id: string; to_stage: string; created_at: Date }[] }> {
    const leads = await this.db.query<Lead>(`select * from chatbot.leads where client_id = $1 and created_at >= $2 and created_at < $3`, [clientId, since, until]);
    if (!leads.length) return { leads, moves: [] };
    const moves = await this.db.query<{ lead_id: string; to_stage: string; created_at: Date }>(
      `select lead_id, to_stage, created_at from chatbot.lead_events where lead_id = any($1::uuid[]) and to_stage is not null order by created_at`,
      [leads.map((l) => l.id)],
    );
    return { leads, moves };
  }

  /** Conversas da pessoa (em todos os números do cliente), da mais recente para a mais antiga. */
  async leadConversations(leadId: string): Promise<{ id: string; created_at: Date; last_message_at: Date; message_count: number }[]> {
    return this.db.query(
      `select v.id, v.created_at, v.last_message_at, v.message_count from chatbot.conversations v
       join chatbot.contacts c on c.id = v.contact_id where c.lead_id = $1 order by v.last_message_at desc limit 50`,
      [leadId],
    );
  }

  /** Apaga o lead e todo o histórico da pessoa neste cliente (pedido de exclusão, LGPD). */
  async deleteLeadEverything(leadId: string): Promise<void> {
    await this.db.query(`delete from chatbot.contacts where lead_id = $1`, [leadId]);
    await this.db.query(`delete from chatbot.leads where id = $1`, [leadId]);
  }

  /** Apaga tudo de um número (quando o número é excluído). */
  async purgeNumber(numberId: string): Promise<void> {
    await this.db.query(`delete from chatbot.contacts where number_id = $1`, [numberId]);
    await this.db.query(`delete from chatbot.daily_stats where number_id = $1`, [numberId]);
  }

  /**
   * Apaga conversas (e as mensagens, em cascata) sem nenhuma atividade há
   * mais de `days` dias, e depois os contatos que ficaram sem conversa
   * nenhuma. As estatísticas agregadas (chatbot.daily_stats) não são
   * afetadas — o gráfico de atividade continua funcionando normalmente.
   * Pensado para rodar uma vez por dia (ver src/server/monitor.ts).
   */
  async purgeOldConversations(days: number): Promise<{ conversations: number; contacts: number }> {
    const conv = await this.db.query<{ id: string }>(
      `delete from chatbot.conversations where last_message_at < now() - ($1 || ' days')::interval returning id`,
      [days],
    );
    const contacts = await this.db.query<{ id: string }>(
      `delete from chatbot.contacts c
         where not exists (select 1 from chatbot.conversations v where v.contact_id = c.id)
       returning c.id`,
    );
    return { conversations: conv.length, contacts: contacts.length };
  }
}

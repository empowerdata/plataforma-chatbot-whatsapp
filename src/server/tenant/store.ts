import "server-only";
import type { SqlExecutor } from "./executor";

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
  first_seen_at: Date;
  last_seen_at: Date;
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
  created_at: Date;
  closed_at: Date | null;
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

  async setContactName(contactId: string, name: string): Promise<void> {
    await this.db.query(`update chatbot.contacts set name = $2 where id = $1`, [contactId, name]);
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

  async listConversations(input: { numberId?: string; numberIds?: string[]; needsHuman?: boolean; limit?: number; offset?: number }): Promise<(Conversation & { contact_phone: string | null; contact_name: string | null; contact_push_name: string | null })[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (input.numberId) {
      params.push(input.numberId);
      where.push(`c.number_id = $${params.length}`);
    } else if (input.numberIds && input.numberIds.length) {
      params.push(input.numberIds);
      where.push(`c.number_id = any($${params.length}::uuid[])`);
    }
    if (input.needsHuman) where.push(`c.needs_human = true`);
    params.push(input.limit ?? 50);
    const limitIdx = params.length;
    params.push(input.offset ?? 0);
    const offsetIdx = params.length;
    return this.db.query(
      `select c.*, ct.phone as contact_phone, ct.name as contact_name, ct.push_name as contact_push_name
       from chatbot.conversations c
       join chatbot.contacts ct on ct.id = c.contact_id
       ${where.length ? "where " + where.join(" and ") : ""}
       order by c.last_message_at desc
       limit $${limitIdx} offset $${offsetIdx}`,
      params,
    );
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
      const preview = (m.text ?? m.transcript ?? `[${m.type ?? "mídia"}]`).slice(0, 120);
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
    }
    return row;
  }

  async listMessages(conversationId: string, limit = 200): Promise<MessageRow[]> {
    return this.db.query<MessageRow>(
      `select * from chatbot.messages where conversation_id = $1 order by created_at asc, id asc limit $2`,
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
    const dayStr = day.toISOString().slice(0, 10);
    const params: unknown[] = [numberId, dayStr];
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

  async dailyStats(numberIds: string[], fromDay: Date, toDay: Date): Promise<(DailyStat & { number_id: string })[]> {
    if (!numberIds.length) return [];
    const rows = await this.db.query<(DailyStat & { number_id: string; day: unknown })>(
      `select number_id, day::text as day, conversations, messages_in, messages_out, bot_messages, human_messages, new_contacts, handoffs, tokens_in::int as tokens_in, tokens_out::int as tokens_out
       from chatbot.daily_stats
       where number_id = any($1::uuid[]) and day between $2::date and $3::date
       order by day asc`,
      [numberIds, fromDay.toISOString().slice(0, 10), toDay.toISOString().slice(0, 10)],
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

  async contactsCount(numberIds: string[]): Promise<number> {
    if (!numberIds.length) return 0;
    const rows = await this.db.query<{ n: number | string }>(`select count(*) as n from chatbot.contacts where number_id = any($1::uuid[])`, [numberIds]);
    return Number(rows[0]?.n ?? 0);
  }

  /** Apaga tudo de um número (quando o número é excluído). */
  async purgeNumber(numberId: string): Promise<void> {
    await this.db.query(`delete from chatbot.contacts where number_id = $1`, [numberId]);
    await this.db.query(`delete from chatbot.daily_stats where number_id = $1`, [numberId]);
  }
}

import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { env } from "../env";
import { getTenantStore } from "../tenant";
import { dayKey } from "@/lib/utils";

/**
 * Indicadores do atendimento: o mesmo painel para a equipe (todos os clientes,
 * com filtro por cliente) e para o cliente final (só os números dele).
 *
 * De onde vem cada número:
 * - Série por dia, conversas iniciadas e pedidos de humano: chatbot.daily_stats,
 *   que a limpeza automática não apaga (vale para qualquer período).
 * - Em aberto / aguardando: retrato de agora, direto das conversas.
 * - Finalizadas, taxa do bot, categorias e horários: das conversas e mensagens
 *   guardadas (só apagadas se o aluno ligar CONVERSATION_RETENTION_DAYS).
 *   Por isso a tela avisa quando o período pedido passa desse limite.
 */

export const INDICATOR_PERIODS = [7, 30, 90] as const;
export type IndicatorPeriod = (typeof INDICATOR_PERIODS)[number];

export function parsePeriod(v: unknown): IndicatorPeriod {
  const n = Number(v);
  return (INDICATOR_PERIODS as readonly number[]).includes(n) ? (n as IndicatorPeriod) : 30;
}

export type Indicators = {
  days: number;
  retentionDays: number;
  hasNumbers: boolean;
  kpis: {
    started: number;
    /** Mesmo total no período anterior de mesmo tamanho (para a variação). */
    startedPrev: number;
    openNow: number;
    waitingNow: number;
    resolved: number;
    handoffs: number;
    newContacts: number;
    /** Conversas iniciadas que o bot levou sozinho, sobre as iniciadas guardadas. */
    botOnly: number;
    botOnlyBase: number;
  };
  daily: { day: string; conversations: number; messagesIn: number; handoffs: number }[];
  /** "" = sem categoria; sempre por último. */
  categories: { category: string; n: number }[];
  /** 24 posições, hora do dia no fuso de exibição. */
  hours: number[];
  /** Só para a equipe sem filtro de cliente: conversas iniciadas por cliente. */
  byClient: { name: string; n: number }[] | null;
};

type Scope = { accountId: string; clientId: string | null; staff: boolean };

async function scopeNumbers(scope: Scope) {
  const db = await getDb();
  const conds = [eq(schema.numbers.accountId, scope.accountId)];
  if (scope.clientId) conds.push(eq(schema.numbers.clientId, scope.clientId));
  return db
    .select({ id: schema.numbers.id, clientId: schema.numbers.clientId, clientName: schema.clients.name })
    .from(schema.numbers)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.numbers.clientId))
    .where(and(...conds));
}

/** Clientes da conta que têm número (opções do filtro da equipe). */
export async function indicatorClients(accountId: string): Promise<{ id: string; name: string }[]> {
  const rows = await scopeNumbers({ accountId, clientId: null, staff: true });
  const map = new Map<string, string>();
  for (const r of rows) if (r.clientId && r.clientName) map.set(r.clientId, r.clientName);
  return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

const DAY = 86400_000;

/** Primeiro instante do dia `key` (AAAA-MM-DD) em Brasília (sem horário de verão desde 2019). */
function startOfDay(key: string): Date {
  return new Date(`${key}T00:00:00-03:00`);
}

export async function getIndicators(scope: Scope, days: number): Promise<Indicators> {
  const retentionDays = env.CONVERSATION_RETENTION_DAYS;
  const nums = await scopeNumbers(scope);
  const empty: Indicators = {
    days,
    retentionDays,
    hasNumbers: nums.length > 0,
    kpis: { started: 0, startedPrev: 0, openNow: 0, waitingNow: 0, resolved: 0, handoffs: 0, newContacts: 0, botOnly: 0, botOnlyBase: 0 },
    daily: [],
    categories: [],
    hours: Array.from({ length: 24 }, () => 0),
    byClient: null,
  };

  const now = new Date();
  const dayKeys = Array.from({ length: days }, (_, i) => dayKey(new Date(now.getTime() - (days - 1 - i) * DAY)));
  empty.daily = dayKeys.map((day) => ({ day, conversations: 0, messagesIn: 0, handoffs: 0 }));
  if (!nums.length) return empty;

  const ids = nums.map((n) => n.id);
  const since = startOfDay(dayKeys[0]);
  const prevFrom = dayKey(new Date(since.getTime() - days * DAY + DAY / 2));
  const prevTo = dayKey(new Date(since.getTime() - DAY / 2));
  const store = await getTenantStore(scope.accountId);

  const [rows, prevRows, summary, categories, hoursUtc] = await Promise.all([
    store.dailyStats(ids, dayKeys[0], dayKeys[dayKeys.length - 1]),
    store.dailyStats(ids, prevFrom, prevTo),
    store.indicatorSummary(ids, since),
    store.categoryCountsSince(ids, since),
    store.inboundByHourUtc(ids, since),
  ]);

  const out = empty;
  const byDay = new Map(out.daily.map((d) => [d.day, d]));
  const perNumber = new Map<string, number>();
  for (const r of rows) {
    out.kpis.started += r.conversations;
    out.kpis.handoffs += r.handoffs;
    out.kpis.newContacts += r.new_contacts;
    const d = byDay.get(r.day);
    if (d) {
      d.conversations += r.conversations;
      d.messagesIn += r.messages_in;
      d.handoffs += r.handoffs;
    }
    perNumber.set(r.number_id, (perNumber.get(r.number_id) ?? 0) + r.conversations);
  }
  out.kpis.startedPrev = prevRows.reduce((s, r) => s + r.conversations, 0);
  out.kpis.openNow = summary.openNow;
  out.kpis.waitingNow = summary.waitingNow;
  out.kpis.resolved = summary.resolved;
  out.kpis.botOnly = summary.botOnly;
  out.kpis.botOnlyBase = summary.started;

  const named = categories.filter((c) => c.category !== "").sort((a, b) => b.n - a.n);
  const none = categories.find((c) => c.category === "");
  out.categories = none ? [...named, none] : named;

  // Brasília = UTC−3 o ano todo.
  for (const h of hoursUtc) out.hours[(h.hour + 21) % 24] += h.n;

  if (scope.staff && !scope.clientId) {
    const perClient = new Map<string, number>();
    for (const n of nums) {
      const name = n.clientName ?? "Sem cliente";
      perClient.set(name, (perClient.get(name) ?? 0) + (perNumber.get(n.id) ?? 0));
    }
    // Só vale a pena comparar quando há mais de um.
    out.byClient = perClient.size > 1 ? [...perClient].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n) : null;
  }
  return out;
}

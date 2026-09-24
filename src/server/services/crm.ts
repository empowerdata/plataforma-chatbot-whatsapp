import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getTenantStore } from "../tenant";
import type { Contact, CrmStage, Lead, LeadCardRow, TenantStore } from "../tenant/store";
import { COLD_DAYS, COOLING_DAYS, templateForSegment, type StageKind } from "@/shared/crm-templates";
import { DISPLAY_TZ, dayKey, formatDateTime, formatPhone, initials } from "@/lib/utils";
import type { BoardFilters, CrmBoard, Funnel, LeadCardView, LeadDetail, LeadSignal, StageDraft, TimelineItem, TodayData } from "@/components/crm/types";

/**
 * CRM do cliente do aluno: funil de leads por cliente.
 *
 * Quem move o quê (decisão com o Lorennzo, 2026-09-24):
 * - o sistema só faz o mecânico: a primeira mensagem cria o lead na etapa de
 *   entrada, e o tempo marca "aguardando vocês" / "esfriando";
 * - etapas são movidas por pessoas (agendar, comparecer, fechar, perder);
 * - o bot não mexe no funil (na próxima fase ele só anota sinais e sugere).
 *
 * Escopo: todo acesso passa por um `CrmScope` com o clientId vindo da sessão
 * (portal) ou validado contra a conta (equipe) — nunca do navegador sozinho.
 */
export type CrmScope = { accountId: string; clientId: string; staff: boolean };

const DAY = 86400_000;
const CLOSED_WINDOW_DAYS = 30;
const PER_STAGE = 100;

// ------------------------------------------------------------------ util

function brtDateTimeInput(d: Date | string | null): string | null {
  if (!d) return null;
  // Brasília é UTC−3 o ano todo: o valor do campo datetime-local é a hora local.
  return new Date(new Date(d).getTime() - 3 * 3600_000).toISOString().slice(0, 16);
}

function parseBrtInput(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(`${v.length === 16 ? v : v.slice(0, 16)}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: DISPLAY_TZ });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: DISPLAY_TZ });
const hourMin = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TZ });

/** "qui 26/09 · 14:30" (ou "hoje · 14:30"). */
function whenLabel(d: Date | string): string {
  const date = new Date(d);
  const today = dayKey(new Date());
  const key = dayKey(date);
  const tomorrow = dayKey(new Date(Date.now() + DAY));
  const day = key === today ? "hoje" : key === tomorrow ? "amanhã" : `${weekday.format(date).replace(".", "")} ${dayMonth.format(date)}`;
  return `${day} · ${hourMin.format(date)}`;
}

function ago(d: Date | string | number): string {
  const ms = Date.now() - new Date(d).getTime();
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const days = Math.round(h / 24);
  return `${days} dia${days === 1 ? "" : "s"}`;
}

function money(cents: number | null | undefined): string | null {
  if (cents == null) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

/** Com quem está a bola. Só para leads em etapa aberta. */
function signalOf(l: Pick<Lead, "last_inbound_at" | "last_outbound_at">, open: boolean): LeadSignal {
  if (!open) return null;
  const inAt = l.last_inbound_at ? new Date(l.last_inbound_at).getTime() : 0;
  const outAt = l.last_outbound_at ? new Date(l.last_outbound_at).getTime() : 0;
  if (inAt && inAt > outAt) return { kind: "aguardando", label: `aguardando vocês · ${ago(inAt)}` };
  if (outAt && outAt > inAt) {
    const days = (Date.now() - outAt) / DAY;
    if (days >= COLD_DAYS) return { kind: "frio", label: `sem resposta dele · ${ago(outAt)}` };
    if (days >= COOLING_DAYS) return { kind: "esfriando", label: `sem resposta dele · ${ago(outAt)}` };
  }
  return null;
}

function cardOf(r: LeadCardRow, stage: CrmStage | undefined): LeadCardView {
  const open = !stage || stage.kind === "open";
  const interest = r.interest ? { text: r.interest, suggested: false } : r.conv_category ? { text: r.conv_category, suggested: false } : r.conv_suggested ? { text: r.conv_suggested, suggested: true } : null;
  const next = r.next_action_at ? { label: `${r.next_action_note ? r.next_action_note + " · " : ""}${whenLabel(r.next_action_at)}`, overdue: new Date(r.next_action_at).getTime() < Date.now() } : null;
  return {
    id: r.id,
    name: r.name ?? formatPhone(r.phone),
    initials: initials(r.name),
    phone: formatPhone(r.phone),
    stageId: r.stage_id,
    interest,
    signal: signalOf(r, open),
    appointment: r.appointment_at && (open || stage?.kind === "won") ? whenLabel(r.appointment_at) : null,
    nextAction: open ? next : null,
    value: money(r.value_cents),
    lostReason: stage?.kind === "lost" ? r.lost_reason : null,
    conversationId: r.conversation_id,
    inStageSince: `há ${ago(r.stage_changed_at)}`,
  };
}

// ------------------------------------------------------------ escopo

async function clientRow(scope: CrmScope) {
  const db = await getDb();
  const [client] = await db
    .select({ id: schema.clients.id, name: schema.clients.name, segment: schema.clients.segment })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, scope.clientId), eq(schema.clients.accountId, scope.accountId)))
    .limit(1);
  if (!client) throw new Error("Cliente não encontrado.");
  return client;
}

async function clientNumbers(accountId: string, clientId: string) {
  const db = await getDb();
  return db
    .select({ id: schema.numbers.id, label: schema.numbers.label })
    .from(schema.numbers)
    .where(and(eq(schema.numbers.accountId, accountId), eq(schema.numbers.clientId, clientId)));
}

/** Clientes da conta, para o seletor da equipe (o funil é sempre de um cliente). */
export async function crmClients(accountId: string): Promise<{ id: string; name: string }[]> {
  const db = await getDb();
  const rows = await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.accountId, accountId));
  return rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// ----------------------------------------------------------- pipeline

const seeding = new Map<string, Promise<CrmStage[]>>();

/** Etapas do cliente; na primeira vez cria o funil pelo segmento do cadastro. */
export async function pipelineFor(store: TenantStore, clientId: string, segment?: string | null): Promise<CrmStage[]> {
  const stages = await store.listStages(clientId);
  if (stages.length) return stages;
  // Duas mensagens chegando juntas não podem criar o funil duas vezes.
  const running = seeding.get(clientId);
  if (running) return running;
  const job = (async () => {
    let seg = segment;
    if (seg === undefined) {
      const db = await getDb();
      const [c] = await db.select({ segment: schema.clients.segment }).from(schema.clients).where(eq(schema.clients.id, clientId)).limit(1);
      seg = c?.segment ?? null;
    }
    const again = await store.listStages(clientId);
    if (!again.length) await store.insertStages(clientId, templateForSegment(seg).stages);
    return store.listStages(clientId);
  })();
  seeding.set(clientId, job);
  try {
    return await job;
  } finally {
    seeding.delete(clientId);
  }
}

/**
 * Liga o contato ao lead da pessoa neste cliente, criando o lead na etapa de
 * entrada se for a primeira vez. Chamado pelo motor a cada mensagem de um
 * contato ainda sem lead (e na importação das conversas antigas).
 */
export async function attachLead(store: TenantStore, input: { clientId: string; contact: Contact; source: string | null; createdAt?: Date }): Promise<void> {
  if (input.contact.lead_id) return;
  const stages = await pipelineFor(store, input.clientId);
  const entry = stages.find((s) => s.kind === "open") ?? null;
  await store.touchLead({
    clientId: input.clientId,
    phone: input.contact.phone ?? input.contact.jid.split("@")[0],
    name: input.contact.name ?? input.contact.push_name,
    contactId: input.contact.id,
    source: input.source,
    entryStageId: entry?.id ?? null,
    notes: input.contact.notes,
    createdAt: input.createdAt,
  });
}

/** Conversas de antes do CRM (ou de quando o número não tinha cliente) viram leads na entrada do funil, em lote. */
async function syncLeads(store: TenantStore, scope: CrmScope, stages: CrmStage[]): Promise<void> {
  const nums = await clientNumbers(scope.accountId, scope.clientId);
  if (!(await store.hasContactsWithoutLead(nums.map((n) => n.id)))) return;
  const created = await store.importContactsAsLeads(scope.clientId, stages.find((s) => s.kind === "open")?.id ?? null, nums);
  await store.refreshLeadActivity(created);
}

async function open(scope: CrmScope) {
  const client = await clientRow(scope);
  const store = await getTenantStore(scope.accountId);
  const stages = await pipelineFor(store, scope.clientId, client.segment);
  await syncLeads(store, scope, stages);
  return { client, store, stages };
}

async function leadInScope(store: TenantStore, scope: CrmScope, leadId: string): Promise<Lead> {
  const lead = /^[0-9a-f-]{36}$/i.test(leadId) ? await store.getLead(leadId) : null;
  if (!lead || lead.client_id !== scope.clientId) throw new Error("Lead não encontrado.");
  return lead;
}

// -------------------------------------------------------------- quadro

export function parseBoardParams(sp: Record<string, string | string[] | undefined>): BoardFilters & { leadId: string | null } {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const f = one("f");
  const lead = one("lead");
  return {
    search: one("q").slice(0, 80),
    filter: f === "aguardando" || f === "esfriando" ? f : "",
    view: one("v") === "lista" ? "lista" : "quadro",
    leadId: /^[0-9a-f-]{36}$/i.test(lead) ? lead : null,
  };
}

export async function getBoard(scope: CrmScope, filters: BoardFilters): Promise<CrmBoard> {
  const { store, stages } = await open(scope);
  const rows = await store.boardLeads(scope.clientId, {
    closedSince: new Date(Date.now() - CLOSED_WINDOW_DAYS * DAY),
    perStage: PER_STAGE,
    search: filters.search || undefined,
    waiting: filters.filter === "aguardando",
    coolingBefore: filters.filter === "esfriando" ? new Date(Date.now() - COOLING_DAYS * DAY) : undefined,
  });
  const byId = new Map(stages.map((s) => [s.id, s]));
  const totals = new Map<string, { n: number; v: number }>();
  for (const r of rows) if (r.stage_id) totals.set(r.stage_id, { n: Number(r.stage_total ?? 0), v: Number(r.stage_value ?? 0) });
  return {
    stages: stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, asksDate: s.asks_date, count: totals.get(s.id)?.n ?? 0, valueLabel: totals.get(s.id)?.v ? money(totals.get(s.id)!.v) : null })),
    cards: rows.filter((r) => r.stage_id && byId.has(r.stage_id)).map((r) => cardOf(r, byId.get(r.stage_id!))),
    perStage: PER_STAGE,
  };
}

// ---------------------------------------------------------------- ficha

const EVENT_LABEL: Record<string, string> = {
  created: "Entrou no funil",
  next_action: "Próxima ação marcada",
  next_action_done: "Próxima ação concluída",
  value: "Valor alterado",
  interest: "Interesse definido",
  appointment: "Agendamento alterado",
};

export async function getLeadDetail(scope: CrmScope, leadId: string): Promise<LeadDetail | null> {
  const { store, stages } = await open(scope);
  const lead = await leadInScope(store, scope, leadId).catch(() => null);
  if (!lead) return null;
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const stage = stages.find((s) => s.id === lead.stage_id);
  const [events, convs] = await Promise.all([store.listLeadEvents(lead.id), store.leadConversations(lead.id)]);

  const items: (TimelineItem & { at: number })[] = [];
  for (const e of events) {
    const data = (typeof e.data === "string" ? JSON.parse(e.data) : e.data) as Record<string, unknown> | null;
    let label = EVENT_LABEL[e.type] ?? e.type;
    let detail: string | null = null;
    if (e.type === "stage") label = `Movido para ${stageName.get(e.to_stage ?? "") ?? "etapa removida"}`;
    if (e.type === "created" && e.to_stage) label = `Entrou no funil em ${stageName.get(e.to_stage) ?? "Novo"}`;
    if (data?.appointmentAt) detail = `Agendado para ${whenLabel(String(data.appointmentAt))}`;
    if (data?.lostReason) detail = `Motivo: ${String(data.lostReason)}`;
    if (typeof data?.text === "string") detail = data.text;
    items.push({ id: e.id, at: new Date(e.created_at).getTime(), when: formatDateTime(e.created_at), label, detail, actor: e.actor });
  }
  convs.forEach((c, i) => {
    if (i === convs.length - 1 && convs.length === 1) return; // a primeira conversa é o próprio "entrou no funil"
    items.push({ id: `conv-${c.id}`, at: new Date(c.created_at).getTime(), when: formatDateTime(c.created_at), label: i === convs.length - 1 ? "Primeira conversa" : "Voltou a conversar", detail: `${c.message_count} mensagens`, actor: null });
  });
  items.sort((a, b) => b.at - a.at);

  const conv = convs[0] ?? null;
  const convRow = conv ? await store.getConversation(conv.id) : null;
  return {
    id: lead.id,
    name: lead.name ?? formatPhone(lead.phone),
    rawName: lead.name,
    phone: formatPhone(lead.phone),
    initials: initials(lead.name),
    stageId: lead.stage_id,
    interest: lead.interest,
    interestSuggestion: lead.interest ? null : (convRow?.category ?? convRow?.suggested_category ?? null),
    valueCents: lead.value_cents,
    notes: lead.notes ?? "",
    nextActionAt: brtDateTimeInput(lead.next_action_at),
    nextActionNote: lead.next_action_note,
    appointmentAt: brtDateTimeInput(lead.appointment_at),
    appointmentLabel: lead.appointment_at ? whenLabel(lead.appointment_at) : null,
    lostReason: lead.lost_reason,
    source: lead.source,
    createdLabel: formatDateTime(lead.created_at),
    signal: signalOf(lead, !stage || stage.kind === "open"),
    conversationId: conv?.id ?? null,
    timeline: items.map(({ at: _at, ...t }) => {
      void _at;
      return t;
    }),
  };
}

// ------------------------------------------------------------ mudanças

export async function moveLeadTo(scope: CrmScope, leadId: string, stageId: string, extras: { appointmentAt?: string; lostReason?: string }, actor: string): Promise<void> {
  const { store, stages } = await open(scope);
  const lead = await leadInScope(store, scope, leadId);
  const to = stages.find((s) => s.id === stageId);
  if (!to) throw new Error("Etapa não encontrada.");
  const appointmentAt = parseBrtInput(extras.appointmentAt);
  if (to.asks_date && !appointmentAt) throw new Error(`Informe a data e a hora para mover para "${to.name}".`);
  const lostReason = extras.lostReason?.trim().slice(0, 200) || null;
  if (to.kind === "lost" && !lostReason) throw new Error("Escolha o motivo da perda.");
  await store.moveLead(lead.id, to, { actor, appointmentAt, lostReason });
}

export type LeadPatch = { name?: string; interest?: string; valueCents?: number | null; notes?: string; nextActionAt?: string | null; nextActionNote?: string | null; appointmentAt?: string | null };

export async function updateLeadFields(scope: CrmScope, leadId: string, patch: LeadPatch, actor: string): Promise<void> {
  const { store } = await open(scope);
  const lead = await leadInScope(store, scope, leadId);
  const set: Parameters<TenantStore["updateLead"]>[1] = {};
  if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 80) || null;
  if (patch.notes !== undefined) set.notes = patch.notes.trim().slice(0, 4000) || null;
  if (patch.interest !== undefined) {
    set.interest = patch.interest.trim().slice(0, 60) || null;
    if (set.interest !== lead.interest) await store.addLeadEvent(lead.id, { type: "interest", actor, data: set.interest ? { text: set.interest } : {} });
  }
  if (patch.valueCents !== undefined) {
    const v = patch.valueCents == null ? null : Math.max(0, Math.round(patch.valueCents));
    if (v !== null && v > 100_000_000) throw new Error("Valor alto demais.");
    set.value_cents = v;
    if (v !== lead.value_cents) await store.addLeadEvent(lead.id, { type: "value", actor, data: v != null ? { text: money(v) } : {} });
  }
  if (patch.nextActionAt !== undefined || patch.nextActionNote !== undefined) {
    const at = patch.nextActionAt === undefined ? lead.next_action_at : parseBrtInput(patch.nextActionAt);
    const note = patch.nextActionNote === undefined ? lead.next_action_note : patch.nextActionNote?.trim().slice(0, 200) || null;
    if (patch.nextActionAt && !at) throw new Error("Data da próxima ação inválida.");
    set.next_action_at = at;
    set.next_action_note = note;
    if (at) await store.addLeadEvent(lead.id, { type: "next_action", actor, data: { text: `${note ? note + " · " : ""}${whenLabel(at)}` } });
  }
  if (patch.appointmentAt !== undefined) {
    const at = parseBrtInput(patch.appointmentAt);
    if (patch.appointmentAt && !at) throw new Error("Data do agendamento inválida.");
    set.appointment_at = at;
    await store.addLeadEvent(lead.id, { type: "appointment", actor, data: at ? { text: whenLabel(at) } : { text: "removido" } });
  }
  await store.updateLead(lead.id, set);
}

export async function completeNextAction(scope: CrmScope, leadId: string, actor: string): Promise<void> {
  const { store } = await open(scope);
  const lead = await leadInScope(store, scope, leadId);
  if (!lead.next_action_at) return;
  await store.updateLead(lead.id, { next_action_at: null, next_action_note: null });
  await store.addLeadEvent(lead.id, { type: "next_action_done", actor, data: lead.next_action_note ? { text: lead.next_action_note } : {} });
}

export async function saveStages(scope: CrmScope, drafts: StageDraft[]): Promise<void> {
  const { store, stages } = await open(scope);
  const clean = drafts.map((d) => ({ id: d.id && stages.some((s) => s.id === d.id) ? d.id : undefined, name: d.name.trim().slice(0, 40), kind: (["open", "won", "lost"] as StageKind[]).includes(d.kind) ? d.kind : "open", asksDate: d.asksDate === true }));
  if (clean.some((s) => !s.name)) throw new Error("Toda etapa precisa de um nome.");
  if (new Set(clean.map((s) => s.name.toLowerCase())).size !== clean.length) throw new Error("Há duas etapas com o mesmo nome.");
  if (clean.length > 12) throw new Error("No máximo 12 etapas.");
  if (!clean.some((s) => s.kind === "open")) throw new Error("O funil precisa de pelo menos uma etapa em andamento.");
  if (!clean.some((s) => s.kind === "won")) throw new Error("O funil precisa de pelo menos uma etapa de ganho (ex.: Compareceu, Fechou).");
  // Leads de etapas removidas vão para a primeira etapa em andamento do funil novo (no store).
  await store.saveStages(scope.clientId, clean);
}

export async function deleteLead(scope: CrmScope, leadId: string): Promise<void> {
  const { store } = await open(scope);
  const lead = await leadInScope(store, scope, leadId);
  await store.deleteLeadEverything(lead.id);
}

// ---------------------------------------------------------------- hoje

function brtDayBounds(): { start: Date; end: Date } {
  const start = new Date(`${dayKey(new Date())}T00:00:00-03:00`);
  return { start, end: new Date(start.getTime() + DAY) };
}

export async function getToday(scope: CrmScope): Promise<TodayData> {
  const { store, stages } = await open(scope);
  const { start, end } = brtDayBounds();
  const rows = await store.todayLeads(scope.clientId, start, end, new Date(Date.now() - COOLING_DAYS * DAY));
  const byId = new Map(stages.map((s) => [s.id, s]));
  const out: TodayData = { stages: stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, asksDate: s.asks_date, count: 0, valueLabel: null })), agenda: [], retorno: [], aguardando: [], esfriando: [], novos: 0 };
  for (const r of rows) out[r.bucket].push(cardOf(r, r.stage_id ? byId.get(r.stage_id) : undefined));
  const entry = stages.find((s) => s.kind === "open");
  if (entry) {
    const board = await store.boardLeads(scope.clientId, { closedSince: new Date(), perStage: 1 });
    out.novos = Number(board.find((r) => r.stage_id === entry.id)?.stage_total ?? 0);
  }
  return out;
}

/** Quantas pendências de hoje (agenda, retornos e quem espera resposta) — o número ao lado de "Hoje". */
export async function todayCount(scope: CrmScope): Promise<number> {
  try {
    const t = await getToday(scope);
    return t.agenda.length + t.retorno.length + t.aguardando.length;
  } catch {
    return 0;
  }
}

// --------------------------------------------------------------- funil

/**
 * Funil de quem chegou no período. "Passou pela etapa" = chegou nela ou em
 * alguma posterior (sem contar as de perda), pelo histórico — então um lead
 * que pulou etapas ou voltou uma não bagunça a conta.
 */
export async function getFunnel(scope: CrmScope, days: number): Promise<Funnel> {
  const { store, stages } = await open(scope);
  const until = new Date();
  const since = new Date(`${dayKey(new Date(until.getTime() - (days - 1) * DAY))}T00:00:00-03:00`);
  const { leads, moves } = await store.funnelData(scope.clientId, since, until);
  const pos = new Map(stages.map((s) => [s.id, s.position]));
  const byId = new Map(stages.map((s) => [s.id, s]));
  const progress = stages.filter((s) => s.kind !== "lost");

  const movesBy = new Map<string, { to: string; at: number }[]>();
  for (const m of moves) {
    const arr = movesBy.get(m.lead_id) ?? [];
    arr.push({ to: m.to_stage, at: new Date(m.created_at).getTime() });
    movesBy.set(m.lead_id, arr);
  }

  const target = stages.find((s) => s.asks_date && s.kind === "open") ?? stages.find((s) => s.kind === "won");
  const durations: number[] = [];
  const maxPos = new Map<string, number>();
  for (const l of leads) {
    const entered = [...(movesBy.get(l.id) ?? []), ...(l.stage_id ? [{ to: l.stage_id, at: new Date(l.stage_changed_at).getTime() }] : [])];
    let best = -1;
    for (const e of entered) {
      const st = byId.get(e.to);
      if (st && st.kind !== "lost") best = Math.max(best, st.position);
    }
    maxPos.set(l.id, best);
    if (target) {
      const hit = entered.filter((e) => (pos.get(e.to) ?? -1) >= target.position && byId.get(e.to)?.kind !== "lost").sort((a, b) => a.at - b.at)[0];
      if (hit) durations.push((hit.at - new Date(l.created_at).getTime()) / DAY);
    }
  }

  const total = leads.length;
  const steps = progress.map((s) => {
    const reached = s.position === progress[0]?.position ? total : leads.filter((l) => (maxPos.get(l.id) ?? -1) >= s.position).length;
    return { id: s.id, name: s.name, kind: s.kind, reached, pct: total ? Math.round((reached / total) * 100) : 0 };
  });
  const wonLeads = leads.filter((l) => byId.get(l.stage_id ?? "")?.kind === "won");
  const lostByStage = stages
    .filter((s) => s.kind === "lost")
    .map((s) => ({ name: s.name, n: leads.filter((l) => l.stage_id === s.id).length }))
    .filter((x) => x.n > 0);
  const reasons = new Map<string, number>();
  for (const l of leads) if (byId.get(l.stage_id ?? "")?.kind === "lost" && l.lost_reason) reasons.set(l.lost_reason, (reasons.get(l.lost_reason) ?? 0) + 1);
  durations.sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : null;

  return {
    total,
    steps,
    won: wonLeads.length,
    wonValue: money(wonLeads.reduce((s, l) => s + (l.value_cents ?? 0), 0) || null),
    lostByStage,
    lostReasons: [...reasons].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
    medianDays: median,
    medianLabel: target?.asks_date ? `Até ${target.name.toLowerCase()}` : "Até fechar",
  };
}

// ------------------------------------------------------- dentro da conversa

/**
 * O lead da pessoa para a ficha da conversa (etapa + próximos passos). Contato
 * antigo, de antes do CRM, vira lead na hora.
 */
export async function leadForConversation(store: TenantStore, clientId: string | null, contact: Contact, source: string | null): Promise<{ view: import("@/components/inbox/types").InboxLead; notes: string | null } | null> {
  if (!clientId) return null;
  if (!contact.lead_id) await attachLead(store, { clientId, contact, source, createdAt: new Date(contact.first_seen_at) });
  const lead = await store.getLeadByContact(contact.id);
  if (!lead) return null;
  const stages = await pipelineFor(store, clientId);
  const stage = stages.find((s) => s.id === lead.stage_id);
  const open = !stage || stage.kind === "open";
  return {
    view: {
      id: lead.id,
      clientId,
      stageId: lead.stage_id,
      stages: stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, asksDate: s.asks_date })),
      nextAction: open && lead.next_action_at ? `${lead.next_action_note ? lead.next_action_note + " · " : ""}${whenLabel(lead.next_action_at)}` : null,
      appointment: lead.appointment_at && stage?.kind !== "lost" ? whenLabel(lead.appointment_at) : null,
    },
    notes: lead.notes,
  };
}

// ------------------------------------------- entrada vinda do navegador

/** Server actions recebem qualquer coisa: só passa o que tem o tipo certo. */
export function sanitizeLeadPatch(p: unknown): LeadPatch {
  const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  const strOrNull = (k: string) => (o[k] === null ? null : str(k));
  const out: LeadPatch = {};
  if (str("name") !== undefined) out.name = str("name");
  if (str("interest") !== undefined) out.interest = str("interest");
  if (str("notes") !== undefined) out.notes = str("notes");
  if ("valueCents" in o) out.valueCents = typeof o.valueCents === "number" && Number.isFinite(o.valueCents) ? o.valueCents : null;
  if ("nextActionAt" in o) out.nextActionAt = strOrNull("nextActionAt") ?? null;
  if ("nextActionNote" in o) out.nextActionNote = strOrNull("nextActionNote") ?? null;
  if ("appointmentAt" in o) out.appointmentAt = strOrNull("appointmentAt") ?? null;
  return out;
}

export function sanitizeMoveExtras(e: unknown): { appointmentAt?: string; lostReason?: string } {
  const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
  return { appointmentAt: typeof o.appointmentAt === "string" ? o.appointmentAt : undefined, lostReason: typeof o.lostReason === "string" ? o.lostReason : undefined };
}

export function sanitizeStages(v: unknown): StageDraft[] {
  if (!Array.isArray(v)) throw new Error("Funil inválido.");
  return v.slice(0, 20).map((s) => {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    return { id: typeof o.id === "string" ? o.id : undefined, name: typeof o.name === "string" ? o.name : "", kind: (o.kind === "won" || o.kind === "lost" ? o.kind : "open") as StageKind, asksDate: o.asksDate === true };
  });
}

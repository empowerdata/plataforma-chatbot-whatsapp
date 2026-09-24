import type { StageKind } from "@/shared/crm-templates";

/** Tipos da tela do CRM (funil, ficha do lead, "Hoje"). Tudo já formatado no servidor. */

export type StageView = { id: string; name: string; kind: StageKind; asksDate: boolean; count: number; valueLabel: string | null };

/** Com quem está a bola: a pessoa falou por último ("aguardando vocês") ou a empresa falou e ela sumiu. */
export type LeadSignal = { kind: "aguardando" | "esfriando" | "frio"; label: string } | null;

export type LeadCardView = {
  id: string;
  name: string;
  initials: string;
  phone: string;
  stageId: string | null;
  /** Interesse confirmado ou, na falta, o sugerido pelo bot (`suggested`). */
  interest: { text: string; suggested: boolean } | null;
  signal: LeadSignal;
  appointment: string | null;
  nextAction: { label: string; overdue: boolean } | null;
  value: string | null;
  lostReason: string | null;
  conversationId: string | null;
  /** "há 3 dias" — quando entrou na etapa atual. */
  inStageSince: string;
};

export type BoardView = "quadro" | "lista";
export type BoardFilter = "" | "aguardando" | "esfriando";
export type BoardFilters = { search: string; filter: BoardFilter; view: BoardView };

export type CrmBoard = {
  stages: StageView[];
  cards: LeadCardView[];
  /** O quadro mostra no máximo isto por etapa aberta. */
  perStage: number;
};

export type TimelineItem = { id: string; when: string; label: string; detail: string | null; actor: string | null };

export type LeadDetail = {
  id: string;
  name: string;
  rawName: string | null;
  phone: string;
  initials: string;
  stageId: string | null;
  interest: string | null;
  interestSuggestion: string | null;
  valueCents: number | null;
  notes: string;
  /** Valores para campos datetime-local (fuso de Brasília): "2026-09-24T17:00". */
  nextActionAt: string | null;
  nextActionNote: string | null;
  appointmentAt: string | null;
  appointmentLabel: string | null;
  lostReason: string | null;
  source: string | null;
  createdLabel: string;
  signal: LeadSignal;
  conversationId: string | null;
  timeline: TimelineItem[];
};

export type TodayData = {
  stages: StageView[];
  agenda: LeadCardView[];
  retorno: LeadCardView[];
  aguardando: LeadCardView[];
  esfriando: LeadCardView[];
  novos: number;
};

export type FunnelStep = { id: string; name: string; kind: StageKind; reached: number; pct: number };
export type Funnel = {
  total: number;
  steps: FunnelStep[];
  won: number;
  wonValue: string | null;
  lostByStage: { name: string; n: number }[];
  lostReasons: { reason: string; n: number }[];
  /** Mediana, em dias, da chegada até o primeiro agendamento (ou até fechar, se o funil não agenda). */
  medianDays: number | null;
  medianLabel: string;
};

export type StageDraft = { id?: string; name: string; kind: StageKind; asksDate: boolean };

export type CrmResult = { error: string | null };

/** Ações que cada tela (equipe ou portal) passa, já com o escopo da sessão. */
export type CrmActions = {
  move: (leadId: string, stageId: string, extras: { appointmentAt?: string; lostReason?: string }) => Promise<CrmResult>;
  update: (leadId: string, patch: { name?: string; interest?: string; valueCents?: number | null; notes?: string; nextActionAt?: string | null; nextActionNote?: string | null; appointmentAt?: string | null }) => Promise<CrmResult>;
  completeNextAction: (leadId: string) => Promise<CrmResult>;
  saveStages: (stages: StageDraft[]) => Promise<CrmResult>;
  deleteLead: (leadId: string) => Promise<CrmResult>;
};

/** Tipos da caixa de entrada (painel da equipe e portal do cliente). Só dados simples, prontos para o navegador. */

export type InboxView = "abertas" | "atencao" | "finalizadas" | "todas";

export const INBOX_VIEWS: { id: InboxView; label: string }[] = [
  { id: "abertas", label: "Em aberto" },
  { id: "atencao", label: "Precisa de você" },
  { id: "finalizadas", label: "Finalizadas" },
  { id: "todas", label: "Todas" },
];

/** Por que o bot está (ou não) respondendo este contato. */
export type BotState =
  | { kind: "active" }
  | { kind: "off" }
  | { kind: "paused"; until: string; reason: "handoff" | "human_reply" | "other" }
  | { kind: "blocked" }
  | { kind: "number_off" }
  | { kind: "no_bot" };

export type InboxListItem = {
  id: string;
  title: string;
  initials: string;
  /** Telefone formatado; null quando o telefone já é o título. */
  phone: string | null;
  preview: string | null;
  lastAt: string;
  numberLabel: string;
  category: string | null;
  resolved: boolean;
  needsHuman: boolean;
  bot: "active" | "off" | "paused" | "unavailable";
};

export type InboxThreadItem =
  | { kind: "day"; id: string; label: string }
  | { kind: "event"; id: string; text: string }
  | {
      kind: "message";
      id: string;
      sender: "contact" | "bot" | "human";
      /** Quem da equipe escreveu (mensagens enviadas pelo painel) ou "pelo celular". */
      author: string | null;
      body: string;
      time: string;
      /** Detalhe técnico da resposta do bot (modelo, tempo, tokens) — só na visão da equipe. */
      meta: string | null;
      offHours: boolean;
    };

export type InboxConversation = {
  id: string;
  title: string;
  initials: string;
  phone: string;
  numberId: string;
  numberLabel: string;
  numberConnected: boolean;
  /** Por quantas horas o bot pausa depois que alguém da equipe responde. */
  pauseHoursOnReply: number;
  category: string | null;
  resolved: boolean;
  needsHuman: boolean;
  handoffReason: string | null;
  bot: BotState;
  botName: string | null;
  createdAt: string;
  messageCount: number;
  contact: {
    name: string | null;
    pushName: string | null;
    phone: string;
    notes: string;
    firstSeenAt: string;
    lastSeenAt: string;
    isBlocked: boolean;
  };
  thread: InboxThreadItem[];
};

export type InboxCounts = Record<InboxView, number>;

export type InboxFilters = {
  view: InboxView;
  category: string | null;
  numberId: string | null;
  search: string;
};

export type ActionResult = { error: string | null };

/** Ações da caixa de entrada; cada área (equipe/portal) passa as suas, já com o escopo certo. */
export type InboxActions = {
  setResolved: (id: string, resolved: boolean) => Promise<ActionResult>;
  setCategory: (id: string, category: string | null) => Promise<ActionResult>;
  setBot: (id: string, enabled: boolean) => Promise<ActionResult>;
  send: (id: string, text: string) => Promise<ActionResult>;
  saveNotes: (id: string, notes: string) => Promise<ActionResult>;
  rename: (id: string, name: string) => Promise<ActionResult>;
  setBlocked: (id: string, blocked: boolean) => Promise<ActionResult>;
};

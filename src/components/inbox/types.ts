/** Tipos da caixa de entrada (painel da equipe e portal do cliente). Só dados simples, prontos para o navegador. */

export type InboxView = "abertas" | "atencao" | "finalizadas" | "todas";

export const INBOX_VIEWS: { id: InboxView; label: string; short: string }[] = [
  { id: "abertas", label: "Conversas em aberto", short: "Abertas" },
  { id: "atencao", label: "Aguardando alguém da equipe", short: "Aguardando" },
  { id: "finalizadas", label: "Conversas finalizadas", short: "Finalizadas" },
  { id: "todas", label: "Todas as conversas", short: "Todas" },
];

/** Quantas conversas a lista traz por vez ("carregar mais" soma outro tanto). */
export const INBOX_PAGE = 60;
export const INBOX_MAX = 600;

/** Por que o bot está (ou não) respondendo este contato. */
export type BotState =
  | { kind: "active" }
  | { kind: "off" }
  | { kind: "paused"; until: string; reason: "handoff" | "human_reply" | "other" }
  | { kind: "blocked" }
  | { kind: "number_off" }
  | { kind: "no_bot" };

/**
 * A situação da conversa, uma só, derivada de tudo o resto:
 * finalizada > aguardando você (o bot chamou a equipe) > bot atendendo > com a equipe.
 */
export type ConversationStatus = "aguardando" | "bot" | "equipe" | "finalizada";

export type InboxListItem = {
  id: string;
  title: string;
  initials: string;
  /** Telefone formatado; null quando o telefone já é o título. */
  phone: string | null;
  preview: string | null;
  lastAt: string;
  numberLabel: string;
  clientName: string | null;
  category: string | null;
  /** A categoria mostrada é só a sugestão do bot (ninguém confirmou ainda). */
  categorySuggested: boolean;
  status: ConversationStatus;
};

/** Mídia de uma mensagem: o arquivo é buscado no WhatsApp só quando a tela pede (`url`). */
export type InboxMedia = { kind: "image" | "video" | "audio" | "document" | "sticker"; url: string; fileName: string | null };

/** Limite de envio pelo painel (o do WhatsApp para foto e vídeo). */
export const MEDIA_MAX_BYTES = 16 * 1024 * 1024;

export type InboxThreadItem =
  | { kind: "day"; id: string; label: string }
  | { kind: "event"; id: string; text: string }
  | {
      kind: "message";
      id: string;
      sender: "contact" | "bot" | "human";
      /** Quem da equipe escreveu (mensagens enviadas pelo painel) ou "pelo celular". */
      author: string | null;
      /** Texto ou legenda (pode ser vazio numa mídia sem legenda). */
      body: string;
      media: InboxMedia | null;
      /** Transcrição de um áudio recebido. */
      transcript: string | null;
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
  clientName: string | null;
  numberConnected: boolean;
  /** Por quantas horas o bot pausa depois que alguém da equipe responde. */
  pauseHoursOnReply: number;
  /** Categoria confirmada por uma pessoa. */
  category: string | null;
  /** Sugestão do bot, quando ninguém confirmou uma categoria. */
  suggestedCategory: string | null;
  status: ConversationStatus;
  /** A pessoa no funil do cliente (null se o número não tem cliente). */
  lead: InboxLead | null;
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

/** Resumo do lead dentro da conversa, para mover de etapa sem sair do chat. */
export type InboxLead = {
  id: string;
  clientId: string;
  stageId: string | null;
  stages: { id: string; name: string; kind: "open" | "won" | "lost"; asksDate: boolean }[];
  nextAction: string | null;
  appointment: string | null;
};

export type InboxCounts = Record<InboxView, number>;

export type InboxFilters = {
  view: InboxView;
  category: string | null;
  numberId: string | null;
  clientId: string | null;
  search: string;
  limit: number;
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
  /** Move a pessoa de etapa no funil (data para etapas de agendamento, motivo para perdas). */
  setStage: (id: string, stageId: string, extras: { appointmentAt?: string; lostReason?: string }) => Promise<ActionResult>;
};

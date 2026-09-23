import { z } from "zod";

/**
 * Configuração de um bot (guardada em bots.config, jsonb).
 * Compartilhada entre servidor e cliente: NÃO importar nada de servidor aqui.
 */

export const weekDays = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;
export type WeekDay = (typeof weekDays)[number];
export const weekDayLabels: Record<WeekDay, string> = {
  seg: "Segunda",
  ter: "Terça",
  qua: "Quarta",
  qui: "Quinta",
  sex: "Sexta",
  sab: "Sábado",
  dom: "Domingo",
};

export const dayHoursSchema = z.object({
  open: z.boolean().default(true),
  /** "HH:MM" */
  from: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("08:00"),
  to: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("18:00"),
});
export type DayHours = z.infer<typeof dayHoursSchema>;

export const businessHoursSchema = z.object({
  enabled: z.boolean().default(false),
  timezone: z.string().default("America/Sao_Paulo"),
  days: z.partialRecord(z.enum(weekDays), dayHoursSchema).default({}),
});
export type BusinessHours = z.infer<typeof businessHoursSchema>;

export const botConfigSchema = z.object({
  identity: z
    .object({
      assistantName: z.string().min(1).max(40).default("Assistente"),
      businessName: z.string().max(80).default(""),
      segment: z.string().max(60).default(""),
      tone: z.enum(["amigavel", "formal", "descontraido"]).default("amigavel"),
      useEmoji: z.boolean().default(true),
      language: z.string().default("pt-BR"),
    })
    .prefault({}),
  /** Instruções principais (o "cérebro"), texto livre com {{variaveis}}. */
  instructions: z.string().max(12000).default(""),
  /** Regras curtas do tipo "nunca prometa prazo". */
  rules: z.array(z.string().max(300)).default([]),
  business: z
    .object({
      description: z.string().max(2000).default(""),
      address: z.string().max(300).default(""),
      phone: z.string().max(40).default(""),
      site: z.string().max(200).default(""),
      paymentMethods: z.string().max(300).default(""),
      deliveryInfo: z.string().max(600).default(""),
      hours: businessHoursSchema.prefault({}),
    })
    .prefault({}),
  behavior: z
    .object({
      greeting: z.string().max(600).default(""),
      offHoursMessage: z.string().max(600).default(""),
      unknownAnswer: z.string().max(600).default(""),
      handoffKeywords: z.array(z.string().max(40)).default(["atendente", "humano", "falar com alguém"]),
      pauseHoursOnHuman: z.number().min(0).max(72).default(6),
      debounceSeconds: z.number().min(0).max(30).default(4),
      maxBubbleChars: z.number().min(120).max(1200).default(420),
      replyToAudio: z.boolean().default(true),
      replyToImages: z.boolean().default(true),
      ignoreGroups: z.boolean().default(true),
      historyMessages: z.number().min(2).max(60).default(20),
    })
    .prefault({}),
  actions: z
    .object({
      handoff: z
        .object({
          enabled: z.boolean().default(true),
          message: z
            .string()
            .max(400)
            .default("Vou chamar uma pessoa da equipe para continuar seu atendimento, só um instante."),
        })
        .prefault({}),
      sendMenu: z
        .object({
          enabled: z.boolean().default(false),
          label: z.string().max(60).default("cardápio"),
          mediaUrl: z.string().max(500).default(""),
          caption: z.string().max(300).default(""),
        })
        .prefault({}),
      sendLocation: z
        .object({
          enabled: z.boolean().default(false),
          name: z.string().max(120).default(""),
          address: z.string().max(300).default(""),
          lat: z.number().default(0),
          lng: z.number().default(0),
        })
        .prefault({}),
      collectOrder: z
        .object({
          enabled: z.boolean().default(false),
          instructions: z.string().max(1200).default(""),
        })
        .prefault({}),
    })
    .prefault({}),
  model: z
    .object({
      /** Vazio = modelo padrão da integração da conta. */
      name: z.string().max(60).default(""),
      temperature: z.number().min(0).max(2).default(0.6),
      maxOutputTokens: z.number().min(64).max(4000).default(600),
      ragChunks: z.number().min(0).max(12).default(5),
    })
    .prefault({}),
});

export type BotConfig = z.infer<typeof botConfigSchema>;
export type BotConfigInput = z.input<typeof botConfigSchema>;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function deepMerge<T>(base: T, patch: Record<string, unknown> | undefined): T {
  if (!isObj(base)) return (patch as T) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (v === undefined) continue;
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Config completa com defaults, aplicando um patch parcial por cima. */
export function defaultBotConfig(overrides: BotConfigInput = {}): BotConfig {
  const base = botConfigSchema.parse({});
  return botConfigSchema.parse(deepMerge(base, overrides as Record<string, unknown>));
}

/** Substitui {{variavel}} por valores; variáveis desconhecidas viram vazio. */
export function applyVariables(text: string, vars: Record<string, string | undefined>): string {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

export function extractVariables(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) out.add(m[1]);
  return [...out];
}

/** Todas as variáveis usadas em qualquer campo de texto do bot. */
export function botVariables(config: BotConfig): string[] {
  const texts = [
    config.instructions,
    ...config.rules,
    config.business.description,
    config.behavior.greeting,
    config.behavior.offHoursMessage,
    config.behavior.unknownAnswer,
    config.actions.handoff.message,
  ];
  const out = new Set<string>();
  for (const t of texts) for (const v of extractVariables(t)) out.add(v);
  return [...out];
}

// ---------------------------------------------------------------------------
// Modelos por nicho
// ---------------------------------------------------------------------------

export type BotTemplate = {
  key: string;
  name: string;
  description: string;
  emoji: string;
  config: BotConfigInput;
  /** Perguntas e respostas iniciais para a base de conhecimento. */
  faq: { q: string; a: string }[];
};

const commonRules = [
  "Responda sempre em português do Brasil, de forma curta e natural, como numa conversa de WhatsApp.",
  "Nunca invente informações que não estejam no seu contexto. Se não souber, diga que vai confirmar com a equipe.",
  "Não peça nem registre dados sensíveis como senhas ou números completos de cartão.",
];

export const botTemplates: BotTemplate[] = [
  {
    key: "pizzaria",
    name: "Pizzaria e delivery",
    emoji: "🍕",
    description: "Tira pedidos, informa cardápio, tempo de entrega e formas de pagamento.",
    config: {
      identity: { assistantName: "Atendente virtual", segment: "Pizzaria / delivery", tone: "amigavel", useEmoji: true },
      instructions:
        "Você é o atendente virtual da {{nome_empresa}}. Sua missão é atender clientes pelo WhatsApp: apresentar o cardápio, tirar dúvidas de sabores, tamanhos e preços, informar tempo de entrega e formas de pagamento, e anotar pedidos.\n\nPara anotar um pedido, colete nesta ordem: itens com tamanho e sabor, se é entrega ou retirada, endereço completo (se entrega), forma de pagamento (e troco para quanto, se dinheiro) e nome do cliente. Ao final, repita o pedido resumido e confirme.\n\nQuando o cliente confirmar o pedido, avise que a equipe vai confirmar o tempo de preparo e chame um atendente humano.",
      rules: [
        ...commonRules,
        "Só ofereça itens que estejam no cardápio da base de conhecimento.",
        "Se perguntarem sobre promoções que você não conhece, diga que vai verificar com a equipe.",
      ],
      behavior: {
        greeting: "Olá! 🍕 Bem-vindo à {{nome_empresa}}. Quer ver o cardápio ou já sabe o que vai pedir?",
        offHoursMessage:
          "Estamos fechados agora. Pode deixar sua mensagem que respondemos assim que abrirmos! 🙂",
      },
      actions: {
        handoff: { enabled: true },
        sendMenu: { enabled: true, label: "cardápio" },
        collectOrder: { enabled: true, instructions: "Itens, tamanho, entrega ou retirada, endereço, pagamento, nome." },
      },
    },
    faq: [
      { q: "Qual o tempo de entrega?", a: "Em média 40 a 50 minutos, dependendo do bairro e do movimento." },
      { q: "Quais formas de pagamento?", a: "Pix, cartão de débito/crédito na entrega e dinheiro (informe o troco)." },
      { q: "Tem taxa de entrega?", a: "Sim, varia por bairro. Informe seu endereço que eu confirmo o valor." },
    ],
  },
  {
    key: "salao",
    name: "Salão e barbearia",
    emoji: "💇",
    description: "Informa serviços, preços e agenda horários com confirmação da equipe.",
    config: {
      identity: { assistantName: "Assistente", segment: "Salão de beleza / barbearia", tone: "amigavel", useEmoji: true },
      instructions:
        "Você é o assistente virtual da {{nome_empresa}}. Atenda clientes pelo WhatsApp: informe serviços, preços, duração e profissionais. Para agendar, colete serviço desejado, profissional (se tiver preferência), dia e horário preferidos e nome do cliente. Explique que o agendamento será confirmado pela equipe e chame um atendente humano ao final.",
      rules: [...commonRules, "Nunca confirme um horário como garantido; diga sempre que a equipe confirmará."],
      behavior: {
        greeting: "Oi! ✨ Aqui é o assistente da {{nome_empresa}}. Quer saber sobre serviços e preços ou agendar um horário?",
      },
      actions: { handoff: { enabled: true } },
    },
    faq: [
      {
        q: "Precisa agendar?",
        a: "Recomendamos agendar para garantir o horário. Também atendemos por ordem de chegada quando há vaga.",
      },
      { q: "Quais formas de pagamento?", a: "Pix, cartão e dinheiro." },
    ],
  },
  {
    key: "clinica",
    name: "Clínica e consultório",
    emoji: "🩺",
    description: "Tira dúvidas sobre especialidades, convênios e pré-agendamento de consultas.",
    config: {
      identity: { assistantName: "Assistente", segment: "Clínica / consultório", tone: "formal", useEmoji: false },
      instructions:
        "Você é o assistente virtual da {{nome_empresa}}. Informe especialidades, profissionais, convênios aceitos, valores de consulta particular, endereço e horários. Para pré-agendar, colete nome completo, especialidade, convênio ou particular, e preferência de dia e período. Nunca dê orientação médica, diagnóstico ou indique medicamentos: oriente a procurar um profissional e, em emergências, o serviço de urgência. Ao concluir o pré-agendamento, chame um atendente humano.",
      rules: [
        ...commonRules,
        "Nunca dê orientação médica, diagnóstico ou dosagem de medicamentos.",
        "Em situação de emergência, oriente a ligar para 192 (SAMU) ou procurar um pronto-socorro.",
      ],
      behavior: {
        greeting:
          "Olá, aqui é o assistente da {{nome_empresa}}. Posso ajudar com informações sobre consultas, convênios e agendamentos.",
      },
      actions: { handoff: { enabled: true } },
    },
    faq: [{ q: "Vocês aceitam convênio?", a: "Aceitamos os convênios listados na nossa base. Me diga o seu que eu confirmo." }],
  },
  {
    key: "loja",
    name: "Loja e comércio",
    emoji: "🛍️",
    description: "Responde sobre produtos, estoque, trocas e horário de funcionamento.",
    config: {
      identity: { assistantName: "Atendente virtual", segment: "Loja / comércio", tone: "amigavel", useEmoji: true },
      instructions:
        "Você é o atendente virtual da {{nome_empresa}}. Responda sobre produtos, preços, disponibilidade, formas de pagamento, entrega, trocas e devoluções, e horário de funcionamento. Quando o cliente quiser comprar ou reservar um produto, colete o item, quantidade e nome, e chame um atendente humano para finalizar.",
      rules: [...commonRules],
      behavior: { greeting: "Olá! 🛍️ Bem-vindo à {{nome_empresa}}. Como posso ajudar?" },
      actions: { handoff: { enabled: true } },
    },
    faq: [{ q: "Qual a política de troca?", a: "Trocas em até 7 dias com a etiqueta e o cupom fiscal." }],
  },
  {
    key: "imobiliaria",
    name: "Imobiliária",
    emoji: "🏠",
    description: "Qualifica interessados em imóveis e encaminha para o corretor.",
    config: {
      identity: { assistantName: "Assistente", segment: "Imobiliária", tone: "formal", useEmoji: false },
      instructions:
        "Você é o assistente virtual da {{nome_empresa}}. Ajude interessados a encontrar imóveis: pergunte se é compra ou aluguel, tipo de imóvel, região, faixa de valor e número de quartos. Apresente opções da base de conhecimento quando houver. Colete nome e melhor horário para contato e encaminhe para um corretor chamando um atendente humano.",
      rules: [...commonRules, "Nunca prometa valores, condições de financiamento ou disponibilidade sem confirmação de um corretor."],
      behavior: {
        greeting: "Olá, aqui é o assistente da {{nome_empresa}}. Está procurando imóvel para comprar ou alugar?",
      },
      actions: { handoff: { enabled: true } },
    },
    faq: [],
  },
  {
    key: "generico",
    name: "Atendimento geral",
    emoji: "💬",
    description: "Ponto de partida em branco para qualquer negócio.",
    config: {
      identity: { assistantName: "Assistente", segment: "", tone: "amigavel", useEmoji: true },
      instructions:
        "Você é o assistente virtual da {{nome_empresa}}. Atenda os clientes pelo WhatsApp com base nas informações da base de conhecimento. Quando não souber responder ou quando o cliente pedir, chame um atendente humano.",
      rules: [...commonRules],
      behavior: { greeting: "Olá! Aqui é o assistente da {{nome_empresa}}. Como posso ajudar?" },
      actions: { handoff: { enabled: true } },
    },
    faq: [],
  },
];

export function getTemplate(key: string): BotTemplate | undefined {
  return botTemplates.find((t) => t.key === key);
}

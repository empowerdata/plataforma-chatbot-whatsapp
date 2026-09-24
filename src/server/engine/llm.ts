import "server-only";
import { generateText, isStepCount, tool, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";
import { applyVariables, type BotConfig } from "@/shared/bot-config";

/**
 * Uma "rodada" do modelo: recebe sistema + histórico + ferramentas, devolve
 * texto e as ferramentas chamadas. Tem um backend real (AI SDK/OpenAI) e um
 * simulado (sem chave), para o produto rodar de ponta a ponta em dev.
 */

export type ToolName = "chamar_atendente" | "enviar_cardapio" | "enviar_localizacao" | "categorizar_conversa";

export type ToolHandlers = {
  chamar_atendente?: (input: { motivo: string; resumo: string }) => Promise<string>;
  enviar_cardapio?: () => Promise<string>;
  enviar_localizacao?: () => Promise<string>;
  /** Lista de categorias válidas fica em `categoryOptions` (passada a `runLlmTurn`), não aqui. */
  categorizar_conversa?: (input: { categoria: string }) => Promise<string>;
};

export type LlmTurnInput = {
  model: LanguageModel | null;
  modelName: string;
  system: string;
  messages: ModelMessage[];
  handlers: ToolHandlers;
  temperature: number;
  maxOutputTokens: number;
  /** Categorias válidas para a ferramenta categorizar_conversa, se o handler estiver presente. */
  categoryOptions?: string[];
  /** Só usado pelo backend simulado. */
  mock?: { config: BotConfig; knowledge: string[]; lastUserText: string; isFirstTurn: boolean; variables?: Record<string, string> };
};

export type LlmTurnResult = {
  text: string;
  toolCalls: { name: string; input: unknown; output?: unknown }[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  latencyMs: number;
  simulated: boolean;
};

export function buildTools(handlers: ToolHandlers, categoryOptions: string[] = []): ToolSet {
  const tools: ToolSet = {};
  if (handlers.categorizar_conversa && categoryOptions.length) {
    tools.categorizar_conversa = tool({
      description: `Marca o assunto principal desta conversa, para organização interna (o cliente nunca vê isso). Chame uma vez, assim que der para saber do que se trata, e de novo se o assunto mudar. Categorias disponíveis: ${categoryOptions.join(", ")}.`,
      inputSchema: z.object({ categoria: z.enum(categoryOptions as [string, ...string[]]) }),
      execute: async (input) => handlers.categorizar_conversa!(input),
    });
  }
  if (handlers.chamar_atendente) {
    tools.chamar_atendente = tool({
      description:
        "Transfere a conversa para um atendente humano da equipe (o bot fica em silêncio nesta conversa até a equipe liberar). Use SOMENTE quando o cliente pedir claramente para falar com uma pessoa, ao concluir um pedido/agendamento que a equipe precisa confirmar, ou se o cliente seguir insatisfeito depois de você tentar ajudar. Nunca use só por não saber uma resposta.",
      inputSchema: z.object({
        motivo: z.string().describe("Motivo curto da transferência"),
        resumo: z.string().describe("Resumo da conversa e do que o cliente precisa, para a equipe"),
      }),
      execute: async (input) => handlers.chamar_atendente!(input),
    });
  }
  if (handlers.enviar_cardapio) {
    tools.enviar_cardapio = tool({
      description: "Envia o cardápio/catálogo (arquivo ou imagem) para o cliente.",
      inputSchema: z.object({}),
      execute: async () => handlers.enviar_cardapio!(),
    });
  }
  if (handlers.enviar_localizacao) {
    tools.enviar_localizacao = tool({
      description: "Envia a localização do estabelecimento para o cliente.",
      inputSchema: z.object({}),
      execute: async () => handlers.enviar_localizacao!(),
    });
  }
  return tools;
}

export async function runLlmTurn(input: LlmTurnInput): Promise<LlmTurnResult> {
  const started = Date.now();
  if (!input.model) return runMockTurn(input, started);

  const result = await generateText({
    model: input.model,
    instructions: input.system,
    messages: input.messages,
    tools: buildTools(input.handlers, input.categoryOptions),
    stopWhen: isStepCount(4),
    temperature: input.temperature,
    maxOutputTokens: input.maxOutputTokens,
  });

  const toolCalls: LlmTurnResult["toolCalls"] = [];
  for (const step of result.steps) {
    for (const call of step.toolCalls) {
      const res = step.toolResults.find((r) => r.toolCallId === call.toolCallId);
      toolCalls.push({ name: call.toolName, input: call.input, output: res?.output });
    }
  }
  const usage = result.totalUsage ?? result.usage;
  return {
    text: result.text,
    toolCalls,
    usage: { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 },
    model: input.modelName,
    latencyMs: Date.now() - started,
    simulated: false,
  };
}

// ---------------------------------------------------------------------------
// Backend simulado (sem chave OpenAI): regras simples para demonstrar o fluxo.
// ---------------------------------------------------------------------------

async function runMockTurn(input: LlmTurnInput, started: number): Promise<LlmTurnResult> {
  const m = input.mock;
  const text = (m?.lastUserText ?? "").toLowerCase();
  const toolCalls: LlmTurnResult["toolCalls"] = [];
  const cfg = m?.config;
  let reply = "";

  const wantsHuman = cfg?.behavior.handoffKeywords.some((k) => k && text.includes(k.toLowerCase()));
  const wantsMenu = cfg?.actions.sendMenu.enabled && text.includes((cfg.actions.sendMenu.label || "cardápio").toLowerCase());
  const wantsLocation = cfg?.actions.sendLocation.enabled && /(onde fica|endere[cç]o|localiza[cç][aã]o|como chego)/.test(text);

  if (wantsHuman && input.handlers.chamar_atendente) {
    const out = await input.handlers.chamar_atendente({ motivo: "Cliente pediu atendimento humano", resumo: m?.lastUserText ?? "" });
    toolCalls.push({ name: "chamar_atendente", input: { motivo: "Cliente pediu atendimento humano" }, output: out });
    reply = cfg?.actions.handoff.message || "Vou chamar alguém da equipe para continuar seu atendimento.";
  } else if (wantsMenu && input.handlers.enviar_cardapio) {
    const out = await input.handlers.enviar_cardapio();
    toolCalls.push({ name: "enviar_cardapio", input: {}, output: out });
    reply = "Aqui está! Me diz o que você quer pedir que eu anoto.";
  } else if (wantsLocation && input.handlers.enviar_localizacao) {
    const out = await input.handlers.enviar_localizacao();
    toolCalls.push({ name: "enviar_localizacao", input: {}, output: out });
    reply = "Enviei nossa localização. Qualquer dúvida para chegar, é só falar.";
  } else if (m?.knowledge.length) {
    const k = m.knowledge[0].replace(/^Pergunta:.*\nResposta:\s*/i, "").slice(0, 300);
    reply = `${k}\n\nPosso ajudar com mais alguma coisa?`;
  } else if (m?.isFirstTurn && cfg?.behavior.greeting) {
    reply = cfg.behavior.greeting;
  } else {
    reply = cfg?.behavior.unknownAnswer || "Entendi! Vou confirmar essa informação com a equipe e já te retorno. Posso ajudar com mais alguma coisa?";
  }

  if (cfg) {
    const vars = { nome_empresa: cfg.identity.businessName, nome_assistente: cfg.identity.assistantName, ...m?.variables };
    reply = applyVariables(reply, vars);
  }

  await new Promise((r) => setTimeout(r, 150));
  return {
    text: reply,
    toolCalls,
    usage: { inputTokens: 0, outputTokens: 0 },
    model: "simulado",
    latencyMs: Date.now() - started,
    simulated: true,
  };
}

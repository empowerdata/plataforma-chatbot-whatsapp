import "server-only";
import type { ModelMessage } from "ai";
import { botConfigSchema, type BotConfigInput } from "@/shared/bot-config";
import { getAccountAi } from "../ai/provider";
import { getTenantStore } from "../tenant/registry";
import { buildSystemPrompt } from "./context";
import { runLlmTurn, type ToolHandlers } from "./llm";
import { retrieveKnowledge } from "./inbound";
import { splitBubbles } from "./reply";

export type PlaygroundMessage = { role: "user" | "assistant"; text: string };

export type PlaygroundResult = {
  bubbles: string[];
  toolCalls: { name: string; input: unknown }[];
  knowledge: { id: string; content: string; distance: number }[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  latencyMs: number;
  simulated: boolean;
  systemPrompt: string;
  /** Categoria que o bot atribuiu a esta conversa de teste, se a ferramenta foi chamada. */
  category: string | null;
};

/**
 * Conversa de teste no Studio: usa a configuração (mesmo não salva), a base
 * de conhecimento do bot (se já indexada) e a IA da conta. Não grava nada.
 */
export async function runPlaygroundTurn(input: {
  accountId: string;
  botId?: string | null;
  config: BotConfigInput;
  variables?: Record<string, string>;
  history: PlaygroundMessage[];
  userText: string;
}): Promise<PlaygroundResult> {
  const config = botConfigSchema.parse(input.config);
  const ai = await getAccountAi(input.accountId);

  let knowledge: { id: string; content: string; distance: number }[] = [];
  if (input.botId) {
    try {
      const store = await getTenantStore(input.accountId);
      knowledge = (await retrieveKnowledge(store, input.botId, input.userText, ai, config.model.ragChunks)).map((k) => ({ id: k.id, content: k.content, distance: Number(k.distance) }));
    } catch {
      knowledge = [];
    }
  }

  const toolCalls: { name: string; input: unknown }[] = [];
  let category: string | null = null;
  const handlers: ToolHandlers = {};
  if (config.categorization.enabled && config.categorization.options.length) {
    handlers.categorizar_conversa = async ({ categoria }) => {
      category = categoria;
      toolCalls.push({ name: "categorizar_conversa", input: { categoria } });
      return "Categoria registrada.";
    };
  }
  if (config.actions.handoff.enabled) {
    handlers.chamar_atendente = async (i) => {
      toolCalls.push({ name: "chamar_atendente", input: i });
      return "Equipe avisada (simulação). Diga ao cliente que uma pessoa vai continuar.";
    };
  }
  if (config.actions.sendMenu.enabled) {
    handlers.enviar_cardapio = async () => {
      toolCalls.push({ name: "enviar_cardapio", input: {} });
      return config.actions.sendMenu.mediaUrl ? "Cardápio enviado (simulação)." : "Não há arquivo de cardápio configurado; avise o cliente que vai mandar em seguida.";
    };
  }
  if (config.actions.sendLocation.enabled) {
    handlers.enviar_localizacao = async () => {
      toolCalls.push({ name: "enviar_localizacao", input: {} });
      return "Localização enviada (simulação).";
    };
  }

  const system = buildSystemPrompt({ config, variables: input.variables ?? {}, contactName: "Cliente de teste", knowledge: knowledge.map((k) => k.content), tools: Object.keys(handlers) });
  const messages: ModelMessage[] = [...input.history.map((m) => ({ role: m.role, content: m.text }) as ModelMessage), { role: "user", content: input.userText }];

  const result = await runLlmTurn({
    model: ai.languageModel(config.model.name || undefined),
    modelName: config.model.name || ai.defaultModel,
    system,
    messages,
    handlers,
    temperature: config.model.temperature,
    maxOutputTokens: config.model.maxOutputTokens,
    categoryOptions: config.categorization.enabled ? config.categorization.options : [],
    mock: { config, knowledge: knowledge.map((k) => k.content), lastUserText: input.userText, isFirstTurn: input.history.length === 0 },
  });

  return {
    bubbles: splitBubbles(result.text, config.behavior.maxBubbleChars),
    toolCalls,
    knowledge,
    usage: result.usage,
    model: result.model,
    latencyMs: result.latencyMs,
    simulated: result.simulated,
    systemPrompt: system,
    category,
  };
}

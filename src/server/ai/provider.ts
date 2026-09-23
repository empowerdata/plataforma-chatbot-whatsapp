import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import type { EmbeddingModel, LanguageModel, TranscriptionModel } from "ai";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { decryptSecret } from "../crypto";
import { env } from "../env";

export const DEFAULT_CHAT_MODEL = "gpt-5.4-mini";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

/** Modelos oferecidos na tela de integrações (id → rótulo). */
export const CHAT_MODEL_OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "gpt-5.4-nano", label: "GPT-5.4 nano", hint: "mais barato, respostas simples" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", hint: "recomendado: ótimo custo-benefício" },
  { id: "gpt-5.4", label: "GPT-5.4", hint: "mais inteligente, mais caro" },
  { id: "gpt-5.5", label: "GPT-5.5", hint: "topo de linha" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", hint: "geração anterior, barato" },
];

export type AccountAi = {
  /** "openai" com chave da conta (ou DEV_OPENAI_API_KEY), "mock" sem chave. */
  kind: "openai" | "mock";
  defaultModel: string;
  languageModel: (modelId?: string) => LanguageModel | null;
  embeddingModel: () => EmbeddingModel | null;
  transcriptionModel: () => TranscriptionModel | null;
};

function fromKey(apiKey: string, defaultModel: string): AccountAi {
  const provider = createOpenAI({ apiKey });
  return {
    kind: "openai",
    defaultModel,
    languageModel: (modelId) => provider(modelId || defaultModel),
    embeddingModel: () => provider.textEmbedding(EMBEDDING_MODEL),
    transcriptionModel: () => provider.transcription(TRANSCRIPTION_MODEL),
  };
}

const MOCK: AccountAi = {
  kind: "mock",
  defaultModel: "simulado",
  languageModel: () => null,
  embeddingModel: () => null,
  transcriptionModel: () => null,
};

/** Provedor de IA da conta: chave OpenAI da conta → chave de dev → simulado. */
export async function getAccountAi(accountId: string): Promise<AccountAi> {
  const db = await getDb();
  const [integ] = await db.select().from(schema.integrations).where(eq(schema.integrations.accountId, accountId)).limit(1);
  const model = integ?.openaiModel || DEFAULT_CHAT_MODEL;
  if (integ?.openaiKeyEnc) return fromKey(decryptSecret(integ.openaiKeyEnc), model);
  if (env.DEV_OPENAI_API_KEY && !env.isProd) return fromKey(env.DEV_OPENAI_API_KEY, model);
  return MOCK;
}

export function aiFromKey(apiKey: string, model = DEFAULT_CHAT_MODEL): AccountAi {
  return fromKey(apiKey, model);
}

/** Valida uma chave OpenAI sem gastar tokens (lista modelos). */
export async function testOpenAiKey(apiKey: string): Promise<{ ok: boolean; error?: string; models?: number }> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401) return { ok: false, error: "Chave inválida ou revogada. Gere uma nova em platform.openai.com/api-keys." };
    if (res.status === 429) return { ok: false, error: "Sem créditos ou limite atingido. Adicione saldo em platform.openai.com/settings/organization/billing." };
    if (!res.ok) return { ok: false, error: `OpenAI respondeu ${res.status}.` };
    const data = (await res.json()) as { data?: unknown[] };
    return { ok: true, models: data.data?.length ?? 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

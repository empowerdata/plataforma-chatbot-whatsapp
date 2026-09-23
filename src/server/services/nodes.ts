import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { EvolutionNode } from "../db/schema";
import { encryptSecret } from "../crypto";
import { checkNodeHealth, nodeUsage } from "../evolution/nodes";

/** Resultado do teste de saúde de um servidor (igual ao do EvolutionClient). */
export type NodeHealth = { ok: boolean; version?: string; error?: string };

export type NodeWithUsage = {
  node: EvolutionNode;
  /** Quantos números (instâncias) estão neste servidor. */
  used: number;
};

/** Todos os servidores, com a ocupação, na ordem em que foram criados. */
export async function listNodes(): Promise<NodeWithUsage[]> {
  const db = await getDb();
  return db
    .select({
      node: schema.evolutionNodes,
      used: db.$count(schema.numbers, eq(schema.numbers.nodeId, schema.evolutionNodes.id)),
    })
    .from(schema.evolutionNodes)
    .orderBy(schema.evolutionNodes.createdAt);
}

export async function getNode(id: string): Promise<EvolutionNode | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.evolutionNodes).where(eq(schema.evolutionNodes.id, id)).limit(1);
  return row ?? null;
}

async function getNodeOrThrow(id: string): Promise<EvolutionNode> {
  const node = await getNode(id);
  if (!node) throw new Error("Servidor não encontrado.");
  return node;
}

/** Aceita só http(s) e devolve a URL sem barra no final. */
function normalizeBaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Endereço inválido. Informe a URL completa, ex.: https://evo.seudominio.com");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("O endereço precisa começar com http:// ou https://.");
  return value;
}

function normalizeName(raw: string): string {
  const name = raw.trim();
  if (name.length < 2) throw new Error("Dê um nome ao servidor.");
  return name;
}

/** Capacidade 0 = sem limite (mesma regra de pickNode). */
function normalizeCapacity(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) throw new Error("Capacidade inválida: use 0 (sem limite) ou um número positivo.");
  return Math.floor(raw);
}

export type CreateNodeInput = {
  name: string;
  baseUrl: string;
  apiKey: string;
  capacity: number;
  notes?: string | null;
};

/** Cadastra um servidor Evolution real, guarda a chave criptografada e já testa a conexão. */
export async function createNode(input: CreateNodeInput): Promise<{ node: EvolutionNode; health: NodeHealth }> {
  const db = await getDb();
  const name = normalizeName(input.name);
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("Informe a chave da API (AUTHENTICATION_API_KEY do servidor).");
  const [node] = await db
    .insert(schema.evolutionNodes)
    .values({
      name,
      kind: "http",
      baseUrl,
      apiKeyEnc: encryptSecret(apiKey),
      capacity: normalizeCapacity(input.capacity),
      notes: input.notes?.trim() || null,
    })
    .returning();
  const health = await checkNodeHealth(node);
  return { node, health };
}

export type UpdateNodeInput = {
  name?: string;
  baseUrl?: string;
  /** Só re-criptografa quando vier preenchida. */
  apiKey?: string;
  capacity?: number;
  isActive?: boolean;
  notes?: string | null;
};

export async function updateNode(id: string, patch: UpdateNodeInput): Promise<void> {
  const db = await getDb();
  await getNodeOrThrow(id);
  const set: Partial<typeof schema.evolutionNodes.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = normalizeName(patch.name);
  if (patch.baseUrl !== undefined) set.baseUrl = normalizeBaseUrl(patch.baseUrl);
  if (patch.apiKey !== undefined && patch.apiKey.trim()) set.apiKeyEnc = encryptSecret(patch.apiKey.trim());
  if (patch.capacity !== undefined) set.capacity = normalizeCapacity(patch.capacity);
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.notes !== undefined) set.notes = patch.notes?.trim() || null;
  await db.update(schema.evolutionNodes).set(set).where(eq(schema.evolutionNodes.id, id));
}

/** Só exclui servidor vazio: números apontam para ele (FK restrict). */
export async function deleteNode(id: string): Promise<void> {
  const db = await getDb();
  await getNodeOrThrow(id);
  const used = await nodeUsage(id);
  if (used > 0) throw new Error("Este servidor ainda tem números; mova ou exclua os números antes.");
  await db.delete(schema.evolutionNodes).where(eq(schema.evolutionNodes.id, id));
}

/** Testa o servidor agora e grava o resultado (lastHealth*). */
export async function checkNode(id: string): Promise<NodeHealth> {
  const node = await getNodeOrThrow(id);
  return checkNodeHealth(node);
}

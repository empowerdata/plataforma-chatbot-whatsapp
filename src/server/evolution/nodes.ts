import "server-only";
import { and, count, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { decryptSecret } from "../crypto";
import type { EvolutionNode } from "../db/schema";
import type { EvolutionClient } from "./types";
import { HttpEvolutionClient } from "./http-client";
import { getFakeEvolution } from "./fake";

/** Cliente para falar com um servidor Evolution específico. */
export function getEvolutionClient(node: Pick<EvolutionNode, "kind" | "baseUrl" | "apiKeyEnc">): EvolutionClient {
  if (node.kind === "fake") return getFakeEvolution();
  return new HttpEvolutionClient(node.baseUrl, decryptSecret(node.apiKeyEnc));
}

export class NoCapacityError extends Error {
  constructor() {
    super("Nenhum servidor WhatsApp com vaga disponível no momento. Avise o administrador da plataforma.");
  }
}

/**
 * Escolhe o servidor com vaga e menor ocupação relativa.
 * Servidores "fake" só entram quando não há servidor real ativo.
 */
export async function pickNode(): Promise<EvolutionNode> {
  const db = await getDb();
  const rows = await db
    .select({
      node: schema.evolutionNodes,
      used: db.$count(schema.numbers, eq(schema.numbers.nodeId, schema.evolutionNodes.id)),
    })
    .from(schema.evolutionNodes)
    .where(eq(schema.evolutionNodes.isActive, true));
  const candidates = rows.filter((r) => r.node.capacity <= 0 || r.used < r.node.capacity);
  const real = candidates.filter((r) => r.node.kind === "http");
  const pool = real.length ? real : candidates;
  if (!pool.length) throw new NoCapacityError();
  pool.sort((a, b) => a.used / Math.max(1, a.node.capacity) - b.used / Math.max(1, b.node.capacity));
  return pool[0].node;
}

export async function nodeUsage(nodeId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ n: count() }).from(schema.numbers).where(eq(schema.numbers.nodeId, nodeId));
  return Number(row?.n ?? 0);
}

/** Testa o servidor e grava o resultado. */
export async function checkNodeHealth(node: EvolutionNode): Promise<{ ok: boolean; version?: string; error?: string }> {
  const db = await getDb();
  const client = getEvolutionClient(node);
  const res = await client.health();
  await db
    .update(schema.evolutionNodes)
    .set({ lastHealthAt: new Date(), lastHealthOk: res.ok, lastHealthError: res.error ?? null, version: res.version ?? node.version, updatedAt: new Date() })
    .where(and(eq(schema.evolutionNodes.id, node.id)));
  return res;
}

import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "./db";
import { checkNodeHealth, getEvolutionClient } from "./evolution/nodes";
import { logEvent } from "./services/events";
import { getTenantStore, TenantNotConfigured } from "./tenant";
import { env } from "./env";

/**
 * Monitor: confere a saúde dos servidores Evolution e o estado de cada número,
 * corrigindo o status no banco e registrando quedas. Roda a cada minuto dentro
 * do processo (instrumentation.ts) e também pode ser chamado por cron externo
 * em /api/internal/monitor.
 */
export async function runMonitorOnce(): Promise<{ nodes: number; numbers: number; changed: number }> {
  const db = await getDb();
  const nodes = await db.select().from(schema.evolutionNodes).where(eq(schema.evolutionNodes.isActive, true));
  let changed = 0;
  for (const node of nodes) {
    const health = await checkNodeHealth(node);
    if (!health.ok && node.lastHealthOk !== false) {
      await logEvent({ level: "error", type: "node", message: `Servidor "${node.name}" fora do ar: ${health.error ?? "sem resposta"}` });
    }
    if (!health.ok) continue;
    const client = getEvolutionClient(node);
    const nums = await db.select().from(schema.numbers).where(and(eq(schema.numbers.nodeId, node.id), ne(schema.numbers.status, "created")));
    for (const n of nums) {
      try {
        const info = await client.getState(n.instanceName);
        const state = info.state === "open" ? "open" : info.state === "connecting" ? (n.status === "qr" ? "qr" : "connecting") : info.state === "unknown" ? n.status : "close";
        if (state !== n.status) {
          changed++;
          await db.update(schema.numbers).set({ status: state, statusUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(schema.numbers.id, n.id));
          if (state === "close") {
            await logEvent({ accountId: n.accountId, numberId: n.id, level: "warn", type: "connection", message: `Número "${n.label}" está desconectado. Reconecte pelo painel.` });
          } else if (state === "open") {
            await logEvent({ accountId: n.accountId, numberId: n.id, type: "connection", message: `Número "${n.label}" voltou a ficar conectado.` });
          }
        }
        if (state === "open" && info.ownerJid && !n.phone) {
          await db.update(schema.numbers).set({ phone: info.ownerJid.split("@")[0].split(":")[0], profileName: info.profileName ?? n.profileName }).where(eq(schema.numbers.id, n.id));
        }
      } catch (err) {
        await db.update(schema.numbers).set({ lastError: (err instanceof Error ? err.message : String(err)).slice(0, 300) }).where(eq(schema.numbers.id, n.id));
      }
    }
  }
  const [{ n }] = await db.select({ n: schema.numbers.id }).from(schema.numbers).limit(1).then((r) => (r.length ? [{ n: 1 }] : [{ n: 0 }]));
  await purgeOldConversationsOnceADay();
  return { nodes: nodes.length, numbers: n, changed };
}

const gp = globalThis as unknown as { __lastPurgeAt?: number };

/**
 * Apaga conversas e mensagens antigas (ver CONVERSATION_RETENTION_DAYS) no
 * Supabase de cada conta, no máximo uma vez por dia — o monitor roda a cada
 * minuto, mas essa limpeza não precisa disso.
 */
async function purgeOldConversationsOnceADay(): Promise<void> {
  const DAY_MS = 24 * 3600_000;
  if (gp.__lastPurgeAt && Date.now() - gp.__lastPurgeAt < DAY_MS - 3600_000) return;
  gp.__lastPurgeAt = Date.now();

  const db = await getDb();
  const accounts = await db.select({ id: schema.accounts.id }).from(schema.accounts);
  for (const { id: accountId } of accounts) {
    try {
      const store = await getTenantStore(accountId);
      const { conversations, contacts } = await store.purgeOldConversations(env.CONVERSATION_RETENTION_DAYS);
      if (conversations > 0) {
        console.log(`[monitor] conta ${accountId}: ${conversations} conversa(s) e ${contacts} contato(s) com mais de ${env.CONVERSATION_RETENTION_DAYS} dias apagados`);
      }
    } catch (err) {
      if (err instanceof TenantNotConfigured) continue; // sem Supabase configurado ainda
      console.error(`[monitor] falha ao limpar conversas antigas da conta ${accountId}`, err);
    }
  }
}

const g = globalThis as unknown as { __monitorTimer?: NodeJS.Timeout };

export function startMonitor(intervalMs = 60_000): void {
  if (g.__monitorTimer) return;
  const tick = async () => {
    try {
      await runMonitorOnce();
    } catch (err) {
      console.error("[monitor] falha", err);
    }
  };
  g.__monitorTimer = setInterval(tick, intervalMs);
  g.__monitorTimer.unref?.();
  setTimeout(tick, 5_000).unref?.();
}

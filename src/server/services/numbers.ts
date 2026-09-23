import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { NumberRow } from "../db/schema";
import { encryptSecret, randomToken } from "../crypto";
import { env } from "../env";
import { getEvolutionClient, pickNode } from "../evolution/nodes";
import { getTenantStore } from "../tenant";
import { logEvent } from "./events";
import { numberSettingsSchema, type NumberSettings } from "@/shared/number-settings";
import { countAccountNumbers, getAccount } from "./accounts";

export type NumberListItem = {
  number: NumberRow;
  clientName: string | null;
  botName: string | null;
  nodeName: string;
  nodeKind: "http" | "fake";
};

export async function listNumbers(accountId: string): Promise<NumberListItem[]> {
  const db = await getDb();
  const rows = await db
    .select({
      number: schema.numbers,
      clientName: schema.clients.name,
      botName: schema.bots.name,
      nodeName: schema.evolutionNodes.name,
      nodeKind: schema.evolutionNodes.kind,
    })
    .from(schema.numbers)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.numbers.clientId))
    .leftJoin(schema.bots, eq(schema.bots.id, schema.numbers.botId))
    .innerJoin(schema.evolutionNodes, eq(schema.evolutionNodes.id, schema.numbers.nodeId))
    .where(eq(schema.numbers.accountId, accountId))
    .orderBy(desc(schema.numbers.createdAt));
  return rows;
}

export async function getNumber(accountId: string, id: string): Promise<NumberRow | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.numbers).where(and(eq(schema.numbers.id, id), eq(schema.numbers.accountId, accountId))).limit(1);
  return row ?? null;
}

export function webhookUrlFor(token: string): string {
  return `${env.APP_URL.replace(/\/+$/, "")}/api/webhooks/evolution/${token}`;
}

/** Cria a instância no servidor Evolution e o registro do número. */
export async function createNumber(input: { accountId: string; label: string; clientId?: string | null; pairingPhone?: string | null }): Promise<NumberRow> {
  const db = await getDb();
  const account = await getAccount(input.accountId);
  if (!account) throw new Error("Conta não encontrada.");
  const total = await countAccountNumbers(input.accountId);
  if (account.plan.maxNumbers > 0 && total >= account.plan.maxNumbers) {
    throw new Error(`Seu plano permite até ${account.plan.maxNumbers} números. Fale com o administrador para ampliar.`);
  }
  const node = await pickNode();
  const client = getEvolutionClient(node);
  const instanceName = `${account.slug.replace(/[^a-z0-9]/g, "").slice(0, 12) || "conta"}-${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}`;
  const webhookToken = randomToken(24);
  const pairingPhone = input.pairingPhone?.replace(/\D/g, "") || null;

  const created = await client.createInstance({ instanceName, webhookUrl: webhookUrlFor(webhookToken), number: pairingPhone ?? undefined });

  const [row] = await db
    .insert(schema.numbers)
    .values({
      accountId: input.accountId,
      clientId: input.clientId ?? null,
      nodeId: node.id,
      label: input.label.trim(),
      instanceName: created.instanceName,
      instanceTokenEnc: created.token ? encryptSecret(created.token) : null,
      webhookToken,
      status: created.qr?.base64 || created.qr?.pairingCode ? "qr" : "connecting",
      lastQr: created.qr?.base64 ?? null,
      lastQrAt: created.qr?.base64 ? new Date() : null,
      pairingCode: created.qr?.pairingCode ?? null,
    })
    .returning();

  // Garante o webhook mesmo se a criação não aceitou o campo.
  try {
    await client.setWebhook(created.instanceName, webhookUrlFor(webhookToken));
  } catch (err) {
    await logEvent({ accountId: input.accountId, numberId: row.id, level: "warn", type: "webhook", message: `Não foi possível confirmar o webhook: ${msg(err)}` });
  }
  await logEvent({ accountId: input.accountId, numberId: row.id, type: "number", message: `Número "${row.label}" criado no servidor "${node.name}".` });
  return row;
}

export type ConnectionInfo = {
  status: NumberRow["status"];
  qr: string | null;
  pairingCode: string | null;
  phone: string | null;
  profileName: string | null;
  lastError: string | null;
};

/** Estado de conexão para a tela de QR (renova o QR quando está velho). */
export async function getConnectionInfo(accountId: string, id: string, opts: { refresh?: boolean } = {}): Promise<ConnectionInfo> {
  const db = await getDb();
  let number = await getNumber(accountId, id);
  if (!number) throw new Error("Número não encontrado.");
  const [node] = await db.select().from(schema.evolutionNodes).where(eq(schema.evolutionNodes.id, number.nodeId)).limit(1);
  const client = getEvolutionClient(node);

  if (number.status !== "open") {
    try {
      const info = await client.getState(number.instanceName);
      if (info.state === "open") {
        await db.update(schema.numbers).set({ status: "open", statusUpdatedAt: new Date(), lastQr: null, pairingCode: null, phone: info.ownerJid ? info.ownerJid.split("@")[0].split(":")[0] : number.phone, profileName: info.profileName ?? number.profileName, updatedAt: new Date() }).where(eq(schema.numbers.id, id));
      } else {
        const stale = !number.lastQrAt || Date.now() - new Date(number.lastQrAt).getTime() > 45_000;
        if (opts.refresh || stale || !number.lastQr) {
          const qr = await client.connect(number.instanceName);
          await db
            .update(schema.numbers)
            .set({ lastQr: qr.base64 ?? number.lastQr, lastQrAt: qr.base64 ? new Date() : number.lastQrAt, pairingCode: qr.pairingCode ?? number.pairingCode, status: qr.base64 || qr.pairingCode ? "qr" : "connecting", updatedAt: new Date() })
            .where(eq(schema.numbers.id, id));
        }
      }
    } catch (err) {
      await db.update(schema.numbers).set({ lastError: msg(err).slice(0, 300) }).where(eq(schema.numbers.id, id));
    }
    number = (await getNumber(accountId, id))!;
  }
  return { status: number.status, qr: number.lastQr, pairingCode: number.pairingCode, phone: number.phone, profileName: number.profileName, lastError: number.lastError };
}

export async function reconnectNumber(accountId: string, id: string): Promise<void> {
  const db = await getDb();
  const number = await getNumber(accountId, id);
  if (!number) throw new Error("Número não encontrado.");
  const [node] = await db.select().from(schema.evolutionNodes).where(eq(schema.evolutionNodes.id, number.nodeId)).limit(1);
  const client = getEvolutionClient(node);
  try {
    await client.restart(number.instanceName);
  } catch {}
  const qr = await client.connect(number.instanceName);
  await db
    .update(schema.numbers)
    .set({ lastQr: qr.base64 ?? null, lastQrAt: new Date(), pairingCode: qr.pairingCode ?? null, status: qr.base64 || qr.pairingCode ? "qr" : "connecting", statusUpdatedAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(schema.numbers.id, id));
}

export async function disconnectNumber(accountId: string, id: string): Promise<void> {
  const db = await getDb();
  const number = await getNumber(accountId, id);
  if (!number) throw new Error("Número não encontrado.");
  const [node] = await db.select().from(schema.evolutionNodes).where(eq(schema.evolutionNodes.id, number.nodeId)).limit(1);
  await getEvolutionClient(node).logout(number.instanceName);
  await db.update(schema.numbers).set({ status: "close", statusUpdatedAt: new Date(), lastQr: null, pairingCode: null, updatedAt: new Date() }).where(eq(schema.numbers.id, id));
  await logEvent({ accountId, numberId: id, type: "number", message: `Número "${number.label}" desconectado pelo painel.` });
}

export async function deleteNumber(accountId: string, id: string): Promise<void> {
  const db = await getDb();
  const number = await getNumber(accountId, id);
  if (!number) return;
  const [node] = await db.select().from(schema.evolutionNodes).where(eq(schema.evolutionNodes.id, number.nodeId)).limit(1);
  try {
    const client = getEvolutionClient(node);
    await client.logout(number.instanceName).catch(() => {});
    await client.deleteInstance(number.instanceName);
  } catch (err) {
    await logEvent({ accountId, level: "warn", type: "number", message: `Instância "${number.instanceName}" pode não ter sido removida do servidor: ${msg(err)}` });
  }
  try {
    const store = await getTenantStore(accountId);
    await store.purgeNumber(id);
  } catch {}
  await db.delete(schema.numbers).where(eq(schema.numbers.id, id));
}

export async function updateNumber(accountId: string, id: string, patch: { label?: string; clientId?: string | null; variables?: Record<string, string>; settings?: NumberSettings; botEnabled?: boolean }): Promise<void> {
  const db = await getDb();
  const set: Partial<typeof schema.numbers.$inferInsert> = { updatedAt: new Date() };
  if (patch.label !== undefined) set.label = patch.label.trim();
  if (patch.clientId !== undefined) set.clientId = patch.clientId;
  if (patch.variables !== undefined) set.variables = patch.variables;
  if (patch.settings !== undefined) set.settings = numberSettingsSchema.parse(patch.settings);
  if (patch.botEnabled !== undefined) set.botEnabled = patch.botEnabled;
  await db.update(schema.numbers).set(set).where(and(eq(schema.numbers.id, id), eq(schema.numbers.accountId, accountId)));
}

export async function assignBot(accountId: string, id: string, botId: string | null): Promise<void> {
  const db = await getDb();
  if (botId) {
    const [bot] = await db.select({ id: schema.bots.id }).from(schema.bots).where(and(eq(schema.bots.id, botId), eq(schema.bots.accountId, accountId))).limit(1);
    if (!bot) throw new Error("Bot não encontrado.");
  }
  await db.update(schema.numbers).set({ botId, updatedAt: new Date() }).where(and(eq(schema.numbers.id, id), eq(schema.numbers.accountId, accountId)));
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

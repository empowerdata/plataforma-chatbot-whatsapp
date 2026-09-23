import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

process.env.APP_SECRET = "segredo-de-teste-com-mais-de-16-chars";
process.env.DATA_DIR = path.join(os.tmpdir(), "pc-e2e-" + process.pid);
process.env.SEED_DEMO = "0";
process.env.DEV_SIMULATOR = "1";
process.env.APP_URL = "http://teste.local";
delete process.env.DEV_OPENAI_API_KEY;

/**
 * Ponta a ponta sem rede: Evolution simulada → webhook (chamado direto) →
 * engine → banco do aluno (PGlite) → resposta do bot (IA simulada).
 *
 * Cada rodada do bot (respondToContact) grava, como último passo, uma
 * mensagem interna (sender "system", type "meta") só quando enviou algo.
 * Os testes sincronizam com essa marca em vez de contadores parciais da
 * conversa, que podem mudar no meio do envio (há um atraso "digitando"
 * entre bolhas).
 */
describe("engine ponta a ponta (Evolution simulada + IA simulada)", () => {
  let accountId: string;
  let numberId: string;
  let instanceName: string;
  let fake: import("@/server/evolution/fake").FakeEvolutionClient;
  let store: import("@/server/tenant/store").TenantStore;

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const countMarkers = async (): Promise<number> => {
    const convs = await store.listConversations({ numberId, limit: 100 });
    let n = 0;
    for (const c of convs) {
      const msgs = await store.listMessages(c.id, 500);
      n += msgs.filter((m) => m.sender === "system" && m.type === "meta").length;
    }
    return n;
  };

  /** Espera o bot terminar uma rodada completa (marca gravada após tudo, inclusive estatísticas). */
  const waitForReply = async (before: number, ms = 12_000): Promise<number> => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const n = await countMarkers();
      if (n > before) return n;
      await sleep(120);
    }
    throw new Error("timeout esperando o bot responder");
  };

  /** Confirma que o bot ficou em silêncio por um período (usado nos casos "não deve responder"). */
  const expectNoReply = async (before: number, ms = 3000): Promise<void> => {
    await sleep(ms);
    expect(await countMarkers()).toBe(before);
  };

  beforeAll(async () => {
    const { FakeEvolutionClient } = await import("@/server/evolution/fake");
    const { getDb, schema } = await import("@/server/db");
    const { eq } = await import("drizzle-orm");
    const { parseWebhook } = await import("@/server/evolution/webhook-parser");
    const { handleWebhookEvent } = await import("@/server/engine/inbound");

    // Entrega webhooks direto na engine (sem HTTP).
    const deliver = async (url: string, payload: unknown) => {
      const token = url.split("/").pop()!;
      const db = await getDb();
      const [n] = await db.select({ id: schema.numbers.id }).from(schema.numbers).where(eq(schema.numbers.webhookToken, token)).limit(1);
      if (n) await handleWebhookEvent(n.id, parseWebhook(payload));
    };
    fake = new FakeEvolutionClient(deliver, null);
    (globalThis as unknown as { __fakeEvolution?: unknown }).__fakeEvolution = fake;

    const db = await getDb();
    const [account] = await db.insert(schema.accounts).values({ name: "Teste", slug: "teste" }).returning();
    accountId = account.id;
    await db.insert(schema.integrations).values({ accountId });

    const { createBot } = await import("@/server/services/bots");
    const { createNumber, assignBot, updateNumber } = await import("@/server/services/numbers");
    const bot = await createBot({ accountId, name: "Bot", templateKey: "pizzaria", businessName: "Pizzaria Teste" });
    const number = await createNumber({ accountId, label: "Teste", clientId: null });
    numberId = number.id;
    instanceName = number.instanceName;
    await assignBot(accountId, number.id, bot.id);
    await updateNumber(accountId, number.id, { settings: { debounceSeconds: 0, notifyPhone: "5511900000000", pauseHoursOnHuman: 2 } });

    const { getTenantStore } = await import("@/server/tenant");
    store = await getTenantStore(accountId);
  }, 60_000);

  afterAll(() => {
    fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
  });

  it("cria a instância aguardando QR e conecta ao 'ler' o QR", async () => {
    const { getDb, schema } = await import("@/server/db");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    let [n] = await db.select().from(schema.numbers).where(eq(schema.numbers.id, numberId));
    expect(n.status).toBe("qr");
    expect(n.lastQr?.startsWith("data:image/png")).toBe(true);
    await fake.simulateScan(instanceName, "5511988880000", "Pizzaria Teste");
    [n] = await db.select().from(schema.numbers).where(eq(schema.numbers.id, numberId));
    expect(n.status).toBe("open");
    expect(n.phone).toBe("5511988880000");
  });

  it("responde a uma mensagem do cliente e registra tudo no banco do aluno", async () => {
    const before = await countMarkers();
    await fake.simulateIncoming(instanceName, { fromPhone: "5511977770001", text: "Oi, qual o tempo de entrega?", pushName: "Juliana" });
    await waitForReply(before);

    const contact = await store.upsertContact({ numberId, jid: "5511977770001@s.whatsapp.net" });
    expect(contact.push_name).toBe("Juliana");
    const { conversation } = await store.getOrCreateConversation({ numberId, contactId: contact.id, timeoutHours: 12 });
    const msgs = await store.listMessages(conversation.id);
    const inbound = msgs.filter((m) => m.sender === "contact");
    const botMsgs = msgs.filter((m) => m.sender === "bot");
    expect(inbound).toHaveLength(1);
    expect(botMsgs.length).toBeGreaterThanOrEqual(1);
    // A resposta veio da base de conhecimento (FAQ do modelo pizzaria) via busca textual.
    expect(botMsgs.map((b) => b.text).join(" ")).toMatch(/40 a 50 minutos/);
    // O eco fromMe da própria resposta não virou "humano".
    expect(msgs.filter((m) => m.sender === "human")).toHaveLength(0);

    const stats = await store.dailyStats([numberId], new Date(Date.now() - 86400_000), new Date());
    expect(stats.reduce((a, s) => a + s.messages_in, 0)).toBeGreaterThanOrEqual(1);
    expect(stats.reduce((a, s) => a + s.bot_messages, 0)).toBeGreaterThanOrEqual(1);
  });

  it("dono respondeu pelo celular: bot pausa e conversa vai para 'human'", async () => {
    const before = await countMarkers();
    await fake.simulateHumanReply(instanceName, { toPhone: "5511977770001", text: "Oi Juliana, aqui é o Marcos!" });
    // O eco dessa mensagem chega como messages.upsert fromMe=true: dá tempo de processar antes de seguir.
    await sleep(300);

    const contact = await store.upsertContact({ numberId, jid: "5511977770001@s.whatsapp.net" });
    const { conversation } = await store.getOrCreateConversation({ numberId, contactId: contact.id, timeoutHours: 12 });
    expect(conversation.status).toBe("human");
    expect(contact.bot_paused_until && new Date(contact.bot_paused_until) > new Date()).toBe(true);

    // Paused: o cliente manda outra mensagem e o bot deve continuar em silêncio.
    await fake.simulateIncoming(instanceName, { fromPhone: "5511977770001", text: "Quero uma pizza grande", pushName: "Juliana" });
    await expectNoReply(before);
  });

  it("pedido de atendente: aciona handoff, avisa o dono e marca a conversa", async () => {
    const before = await countMarkers();
    await fake.simulateIncoming(instanceName, { fromPhone: "5511977770009", text: "quero falar com atendente", pushName: "Célia" });
    await waitForReply(before);

    const contact = await store.upsertContact({ numberId, jid: "5511977770009@s.whatsapp.net" });
    const { conversation } = await store.getOrCreateConversation({ numberId, contactId: contact.id, timeoutHours: 12 });
    expect(conversation.needs_human).toBe(true);

    const notify = fake.outbox(instanceName, "5511900000000");
    expect(notify.some((m) => m.text?.includes("Atendimento humano solicitado"))).toBe(true);

    const stats = await store.dailyStats([numberId], new Date(Date.now() - 86400_000), new Date());
    expect(stats.reduce((a, s) => a + s.handoffs, 0)).toBeGreaterThanOrEqual(1);
  });

  it("mensagem duplicada e grupo são ignorados", async () => {
    const { parseWebhook, buildTextUpsertPayload } = await import("@/server/evolution/webhook-parser");
    const { handleWebhookEvent } = await import("@/server/engine/inbound");

    const convsBefore = (await store.listConversations({ numberId, limit: 100 })).length;
    const groupPayload = buildTextUpsertPayload({ instance: instanceName, remoteJid: "120363@g.us", id: "GRP1", text: "oi grupo" });
    await handleWebhookEvent(numberId, parseWebhook(groupPayload));

    const contact = await store.upsertContact({ numberId, jid: "5511977770001@s.whatsapp.net" });
    const { conversation } = await store.getOrCreateConversation({ numberId, contactId: contact.id, timeoutHours: 12 });
    const dupPayload = buildTextUpsertPayload({ instance: instanceName, remoteJid: "5511977770001@s.whatsapp.net", id: "DUP1", text: "mesma" });
    await handleWebhookEvent(numberId, parseWebhook(dupPayload));
    await handleWebhookEvent(numberId, parseWebhook(dupPayload));

    const convsAfter = (await store.listConversations({ numberId, limit: 100 })).length;
    expect(convsAfter).toBe(convsBefore);
    const dupMsgs = (await store.listMessages(conversation.id, 500)).filter((m) => m.external_id === "DUP1");
    expect(dupMsgs).toHaveLength(1);
  });
});

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
  let ownerClientId: string;
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
    const [owner] = await db.insert(schema.clients).values({ accountId, name: "Pizzaria Teste" }).returning();
    ownerClientId = owner.id;
    const number = await createNumber({ accountId, label: "Teste", clientId: owner.id });
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

  it("número sem cliente é recusado (um número é o WhatsApp de um negócio só)", async () => {
    const { createNumber } = await import("@/server/services/numbers");
    await expect(createNumber({ accountId, label: "Sem dono", clientId: "" })).rejects.toThrow("Escolha o cliente");
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

  // ------------------------------------------------------------ caixa de entrada

  const staffScope = () => ({ accountId, clientId: null, staff: true });

  const conversationOf = async (phone: string) => {
    const contact = await store.upsertContact({ numberId, jid: `${phone}@s.whatsapp.net` });
    const { conversation } = await store.getOrCreateConversation({ numberId, contactId: contact.id, timeoutHours: 12 });
    return { contact, conversation };
  };

  it("caixa de entrada: responder pelo painel envia pelo WhatsApp, pausa o bot e o eco não vira 'pelo celular'", async () => {
    const { sendInboxMessage, getInboxConversation } = await import("@/server/services/inbox");
    const before = await countMarkers();
    await fake.simulateIncoming(instanceName, { fromPhone: "5511977770020", text: "Oi, vocês abrem domingo?", pushName: "Bruno" });
    await waitForReply(before);
    const { conversation } = await conversationOf("5511977770020");

    await sendInboxMessage(staffScope(), conversation.id, "Oi Bruno, aqui é a Maria da equipe!", "Maria");
    expect(fake.outbox(instanceName, "5511977770020").some((m) => m.text === "Oi Bruno, aqui é a Maria da equipe!")).toBe(true);
    await sleep(300); // eco fromMe da Evolution

    const human = (await store.listMessages(conversation.id, 500)).filter((m) => m.sender === "human");
    expect(human).toHaveLength(1);
    expect(human[0].meta).toMatchObject({ via: "painel", author: "Maria" });

    const detail = await getInboxConversation(staffScope(), conversation.id);
    expect(detail?.bot).toMatchObject({ kind: "paused", reason: "human_reply" });
    const humanItem = detail?.thread.find((i) => i.kind === "message" && i.sender === "human");
    expect(humanItem).toMatchObject({ author: "Maria" });
  });

  it("interruptor por conversa: desligar silencia o bot; religar faz voltar a responder na hora", async () => {
    const { setInboxBot, getInboxConversation } = await import("@/server/services/inbox");
    let before = await countMarkers();
    await fake.simulateIncoming(instanceName, { fromPhone: "5511977770030", text: "Oi", pushName: "Carla" });
    before = await waitForReply(before);
    const { conversation } = await conversationOf("5511977770030");

    await setInboxBot(staffScope(), conversation.id, false);
    expect((await getInboxConversation(staffScope(), conversation.id))?.bot.kind).toBe("off");
    await fake.simulateIncoming(instanceName, { fromPhone: "5511977770030", text: "Vocês entregam no centro?", pushName: "Carla" });
    await expectNoReply(before, 1500);

    await setInboxBot(staffScope(), conversation.id, true);
    expect((await getInboxConversation(staffScope(), conversation.id))?.bot.kind).toBe("active");
    await fake.simulateIncoming(instanceName, { fromPhone: "5511977770030", text: "E qual o tempo de entrega?", pushName: "Carla" });
    await waitForReply(before);
  });

  it("religar o bot também tira a pausa do pedido de atendente e o 'precisa de você'", async () => {
    const { setInboxBot, listInbox } = await import("@/server/services/inbox");
    const { conversation } = await conversationOf("5511977770009"); // a Célia, do teste de handoff
    const atencao = await listInbox(staffScope(), { view: "atencao", category: null, numberId: null, clientId: null, limit: 60, search: "" });
    expect(atencao.items.map((i) => i.id)).toContain(conversation.id);

    await setInboxBot(staffScope(), conversation.id, true);
    const after = await store.getConversation(conversation.id);
    expect(after?.needs_human).toBe(false);
    const contact = await store.getContact(conversation.contact_id);
    expect(contact?.bot_paused_until).toBeNull();
  });

  it("busca por nome, telefone ou mensagem", async () => {
    const { listInbox } = await import("@/server/services/inbox");
    const all = { view: "todas" as const, category: null, numberId: null, clientId: null, limit: 60 };
    const byName = await listInbox(staffScope(), { ...all, search: "brun" });
    expect(byName.items.map((i) => i.title)).toEqual(["Bruno"]);
    const byPhone = await listInbox(staffScope(), { ...all, search: "77770030" });
    expect(byPhone.items.map((i) => i.title)).toEqual(["Carla"]);
    const byText = await listInbox(staffScope(), { ...all, search: "Maria da equipe" });
    expect(byText.items.map((i) => i.title)).toEqual(["Bruno"]);
  });

  it("situação de cada conversa é uma só e clara: bot atendendo, com a equipe, aguardando você, finalizada", async () => {
    const { listInbox, setInboxResolved } = await import("@/server/services/inbox");
    const all = { view: "todas" as const, category: null, numberId: null, clientId: null, limit: 60, search: "" };
    const byTitle = async () => Object.fromEntries((await listInbox(staffScope(), all)).items.map((i) => [i.title, i.status]));

    let s = await byTitle();
    expect(s["Bruno"]).toBe("equipe"); // a equipe respondeu pelo painel → bot pausado
    expect(s["Carla"]).toBe("bot");
    expect(s["Célia"]).toBe("bot"); // religada no teste anterior

    const { conversation } = await conversationOf("5511977770030");
    await setInboxResolved(staffScope(), conversation.id, true);
    s = await byTitle();
    expect(s["Carla"]).toBe("finalizada");
    await setInboxResolved(staffScope(), conversation.id, false);
  });

  it("escopo do cliente final: só enxerga e mexe nas conversas dos números dele", async () => {
    const { getDb, schema } = await import("@/server/db");
    const { eq } = await import("drizzle-orm");
    const { listInbox, getInboxConversation, setInboxResolved } = await import("@/server/services/inbox");
    const db = await getDb();
    const [dono] = await db.insert(schema.clients).values({ accountId, name: "Pizzaria do número" }).returning();
    const [outro] = await db.insert(schema.clients).values({ accountId, name: "Outro negócio" }).returning();
    const { conversation } = await conversationOf("5511977770020");
    const filters = { view: "todas" as const, category: null, numberId: null, clientId: null, limit: 60, search: "" };

    await db.update(schema.numbers).set({ clientId: dono.id }).where(eq(schema.numbers.id, numberId));
    try {
      const mine = await listInbox({ accountId, clientId: dono.id, staff: false }, filters);
      expect(mine.items.map((i) => i.id)).toContain(conversation.id);

      // Equipe filtrando por cliente: o dono aparece na lista de clientes e o filtro funciona.
      const staffAll = await listInbox(staffScope(), filters);
      expect(staffAll.clients).toEqual([{ id: dono.id, name: "Pizzaria do número" }]);
      const staffByOther = await listInbox(staffScope(), { ...filters, clientId: outro.id });
      expect(staffByOther.items).toHaveLength(0);

      const other = { accountId, clientId: outro.id, staff: false };
      expect((await listInbox(other, filters)).items).toHaveLength(0);
      expect(await getInboxConversation(other, conversation.id)).toBeNull();
      await expect(setInboxResolved(other, conversation.id, true)).rejects.toThrow("Conversa não encontrada.");
    } finally {
      await db.update(schema.numbers).set({ clientId: ownerClientId }).where(eq(schema.numbers.id, numberId));
    }
  });

  it("indicadores batem com a caixa de entrada e respeitam o escopo", async () => {
    const { getIndicators } = await import("@/server/services/indicators");
    const { listInbox } = await import("@/server/services/inbox");
    const all = { view: "todas" as const, category: null, numberId: null, clientId: null, limit: 60, search: "" };
    const { counts } = await listInbox(staffScope(), all);
    const ind = await getIndicators(staffScope(), 7);

    expect(ind.hasNumbers).toBe(true);
    expect(ind.daily).toHaveLength(7);
    // Tudo neste teste aconteceu hoje: o último dia da série concentra as conversas.
    expect(ind.kpis.started).toBe(counts.todas);
    expect(ind.daily.at(-1)!.conversations).toBe(counts.todas);
    expect(ind.kpis.openNow).toBe(counts.abertas);
    expect(ind.kpis.waitingNow).toBe(counts.atencao);
    expect(ind.categories.reduce((s, c) => s + c.n, 0)).toBe(counts.todas);
    expect(ind.kpis.botOnly).toBeLessThanOrEqual(ind.kpis.botOnlyBase);

    let inbound = 0;
    for (const c of await store.listConversations({ numberId, limit: 100 })) inbound += (await store.listMessages(c.id, 500)).filter((m) => m.direction === "in").length;
    expect(ind.hours).toHaveLength(24);
    expect(ind.hours.reduce((s, n) => s + n, 0)).toBe(inbound);

    const stranger = await getIndicators({ accountId, clientId: "00000000-0000-4000-8000-000000000000", staff: false }, 7);
    expect(stranger.hasNumbers).toBe(false);
    expect(stranger.kpis.started).toBe(0);
  });

  it("arquivo e áudio pelo painel: vão pelo WhatsApp, aparecem na conversa e só quem tem acesso baixa", async () => {
    const { sendInboxMedia, getInboxConversation, getInboxMedia } = await import("@/server/services/inbox");
    const { conversation } = await conversationOf("5511977770020");

    await sendInboxMedia(staffScope(), conversation.id, { data: Buffer.from("%PDF-1.4 teste"), mime: "application/pdf", name: "cardapio.pdf" }, { caption: "Segue o cardápio" }, "Maria");
    await sendInboxMedia(staffScope(), conversation.id, { data: Buffer.from("audio-gravado"), mime: "audio/webm", name: "audio.webm" }, {}, "Maria");
    const out = fake.outbox(instanceName, "5511977770020").map((m) => m.text ?? "");
    expect(out.some((t) => t.includes("Segue o cardápio"))).toBe(true);
    expect(out).toContain("[áudio de voz]"); // áudio vai como mensagem de voz

    const detail = await getInboxConversation(staffScope(), conversation.id);
    const withMedia = (detail?.thread ?? []).filter((i) => i.kind === "message" && i.media);
    const doc = withMedia.find((i) => i.kind === "message" && i.media?.kind === "document");
    const voice = withMedia.find((i) => i.kind === "message" && i.media?.kind === "audio");
    expect(doc).toMatchObject({ body: "Segue o cardápio", author: "Maria", media: { fileName: "cardapio.pdf" } });
    expect(voice).toBeTruthy();

    const got = await getInboxMedia(staffScope(), doc!.id);
    expect(got.data.toString()).toBe("%PDF-1.4 teste");
    expect(got).toMatchObject({ mime: "application/pdf", fileName: "cardapio.pdf" });
    // Outro cliente não baixa o arquivo, nem adivinhando o id.
    await expect(getInboxMedia({ accountId, clientId: "00000000-0000-4000-8000-000000000000", staff: false }, doc!.id)).rejects.toThrow("Mídia não encontrada");
    await expect(sendInboxMedia(staffScope(), conversation.id, { data: Buffer.alloc(16 * 1024 * 1024 + 1), mime: "image/png", name: "grande.png" }, {}, "Maria")).rejects.toThrow("16 MB");

    // Prévia da lista em português, não "[document]".
    expect((await store.getConversation(conversation.id))?.last_message_preview).toBe("🎤 Áudio");
  });
});

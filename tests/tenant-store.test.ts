import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

process.env.APP_SECRET = "segredo-de-teste-com-mais-de-16-chars";
process.env.DATA_DIR = path.join(os.tmpdir(), "pc-tenant-" + process.pid);
process.env.SEED_DEMO = "0";

import { createPgliteExecutor, type SqlExecutor } from "@/server/tenant/executor";
import { installSchema, currentSchemaVersion, TENANT_SCHEMA_VERSION } from "@/server/tenant/registry";
import { TenantStore } from "@/server/tenant/store";

const NUMBER = "11111111-1111-4111-8111-111111111111";
const BOT = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

function vec(seed: number): number[] {
  const v = new Array(1536).fill(0);
  v[seed % 1536] = 1;
  v[(seed * 7) % 1536] = 0.5;
  return v;
}

describe("TenantStore no PGlite (mesmo SQL do Supabase)", () => {
  let db: SqlExecutor;
  let store: TenantStore;
  const dir = path.join(process.env.DATA_DIR!, "t1");

  beforeAll(async () => {
    db = await createPgliteExecutor(dir);
    store = new TenantStore(db);
  });
  afterAll(async () => {
    await db.close();
    fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
  });

  it("instala o schema e é idempotente", async () => {
    expect(await currentSchemaVersion(db)).toBe(0);
    expect(await installSchema(db)).toBe(TENANT_SCHEMA_VERSION);
    expect(await installSchema(db)).toBe(TENANT_SCHEMA_VERSION);
  });

  it("contato, conversa e mensagens", async () => {
    const c = await store.upsertContact({ numberId: NUMBER, jid: "5511999@s.whatsapp.net", phone: "5511999", pushName: "Ana" });
    const again = await store.upsertContact({ numberId: NUMBER, jid: "5511999@s.whatsapp.net" });
    expect(again.id).toBe(c.id);
    expect(again.push_name).toBe("Ana");

    const { conversation, created } = await store.getOrCreateConversation({ numberId: NUMBER, contactId: c.id, timeoutHours: 12 });
    expect(created).toBe(true);
    const second = await store.getOrCreateConversation({ numberId: NUMBER, contactId: c.id, timeoutHours: 12 });
    expect(second.created).toBe(false);
    expect(second.conversation.id).toBe(conversation.id);

    const m1 = await store.insertMessage({ numberId: NUMBER, conversationId: conversation.id, contactId: c.id, externalId: "X1", direction: "in", sender: "contact", text: "oi" });
    expect(m1?.id).toBeTruthy();
    const dup = await store.insertMessage({ numberId: NUMBER, conversationId: conversation.id, contactId: c.id, externalId: "X1", direction: "in", sender: "contact", text: "oi" });
    expect(dup).toBeNull();
    expect(await store.messageExists(NUMBER, "X1")).toBe(true);
    await store.insertMessage({ numberId: NUMBER, conversationId: conversation.id, contactId: c.id, externalId: "B1", direction: "out", sender: "bot", text: "olá!" });

    const conv = await store.getConversation(conversation.id);
    expect(conv?.message_count).toBe(2);
    expect(conv?.bot_message_count).toBe(1);
    expect(conv?.last_message_preview).toBe("olá!");

    const recent = await store.recentMessages(conversation.id, 10);
    expect(recent.map((m) => m.sender)).toEqual(["contact", "bot"]);

    const list = await store.listConversations({ numberIds: [NUMBER] });
    expect(list[0].contact_push_name).toBe("Ana");
  });

  it("pausa do bot e status da conversa", async () => {
    const c = await store.upsertContact({ numberId: NUMBER, jid: "5511888@s.whatsapp.net" });
    const until = new Date(Date.now() + 3600_000);
    await store.pauseContactBot(c.id, until);
    const got = await store.getContact(c.id);
    expect(new Date(got!.bot_paused_until!).getTime()).toBeCloseTo(until.getTime(), -3);
    const { conversation } = await store.getOrCreateConversation({ numberId: NUMBER, contactId: c.id, timeoutHours: 12 });
    await store.setConversationStatus(conversation.id, "human", true, "pediu atendente");
    const conv = await store.getConversation(conversation.id);
    expect(conv?.status).toBe("human");
    expect(conv?.needs_human).toBe(true);
    expect(await store.countOpenNeedsHuman([NUMBER])).toBe(1);
  });

  it("base de conhecimento: busca vetorial e textual", async () => {
    await store.replaceChunks({
      botId: BOT,
      itemId: ITEM,
      chunks: [
        { content: "Pizza mussarela custa R$ 45", embedding: vec(1) },
        { content: "Entrega leva 40 minutos", embedding: vec(500) },
        { content: "Aceitamos pix e cartão", embedding: vec(900) },
      ],
    });
    const byVec = await store.searchChunks(BOT, vec(500), 2);
    expect(byVec[0].content).toContain("Entrega");
    expect(Number(byVec[0].distance)).toBeLessThan(0.01);
    const byText = await store.searchChunksByText(BOT, "quanto custa a pizza mussarela?", 3);
    expect(byText[0].content).toContain("mussarela");
    await store.replaceChunks({ botId: BOT, itemId: ITEM, chunks: [{ content: "novo", embedding: null }] });
    expect((await store.searchChunksByText(BOT, "mussarela", 3)).length).toBe(0);
    await store.deleteBotChunks(BOT);
  });

  it("estatísticas diárias", async () => {
    const day = new Date("2026-09-21T12:00:00Z");
    await store.bumpDailyStat(NUMBER, day, { messages_in: 1, conversations: 1 });
    await store.bumpDailyStat(NUMBER, day, { messages_in: 2, handoffs: 1, tokens_in: 100 });
    const rows = await store.dailyStats([NUMBER], new Date("2026-09-20T00:00:00Z"), new Date("2026-09-22T00:00:00Z"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ day: "2026-09-21", messages_in: 3, conversations: 1, handoffs: 1, tokens_in: 100 });
    expect(await store.contactsCount([NUMBER])).toBe(2);
    await store.purgeNumber(NUMBER);
    expect(await store.contactsCount([NUMBER])).toBe(0);
  });
});

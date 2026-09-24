import { describe, expect, it, vi, beforeAll } from "vitest";
import path from "node:path";
import os from "node:os";

process.env.APP_SECRET = "segredo-de-teste-com-mais-de-16-chars";
process.env.DATA_DIR = path.join(os.tmpdir(), "pc-units-" + process.pid);
process.env.SEED_DEMO = "0";

import { splitBubbles, toWhatsAppText, typingDelayMs } from "@/server/engine/reply";
import { isOpenNow, describeHours } from "@/server/engine/hours";
import { MemoryScheduler } from "@/server/engine/scheduler";
import { buildSystemPrompt } from "@/server/engine/context";
import { applyVariables, botVariables, defaultBotConfig, getTemplate } from "@/shared/bot-config";
import { chunkText, parseFaq, serializeFaq, faqToChunks, htmlToText } from "@/server/ai/text";
import { parseWebhook, buildTextUpsertPayload } from "@/server/evolution/webhook-parser";
import { toModelMessages } from "@/server/engine/inbound";
import { cacheImage } from "@/server/engine/media-cache";
import type { MessageRow } from "@/server/tenant/store";

describe("reply: bolhas de WhatsApp", () => {
  it("converte markdown e divide por parágrafos", () => {
    const text = "## Olá!\n\nAqui está o **cardápio**:\n\n- Mussarela R$ 45\n- Calabresa R$ 48";
    const bubbles = splitBubbles(text, 420);
    expect(bubbles.length).toBeGreaterThanOrEqual(2);
    expect(bubbles.join("\n")).not.toContain("##");
    expect(bubbles.join("\n")).toContain("*cardápio*");
    expect(bubbles.join("\n")).toContain("• Mussarela");
  });

  it("quebra parágrafo longo por frases respeitando o limite", () => {
    const long = Array.from({ length: 12 }, (_, i) => `Frase número ${i + 1} com algum texto para encher.`).join(" ");
    const bubbles = splitBubbles(long, 160);
    expect(bubbles.every((b) => b.length <= 160)).toBe(true);
    expect(bubbles.length).toBeGreaterThan(2);
  });

  it("limita a 6 bolhas e junta bolhas curtas", () => {
    const text = Array.from({ length: 12 }, (_, i) => `Oi ${i}`).join("\n\n");
    expect(splitBubbles(text).length).toBeLessThanOrEqual(6);
  });

  it("delay de digitação fica entre mínimo e máximo", () => {
    expect(typingDelayMs("oi")).toBe(900);
    expect(typingDelayMs("x".repeat(1000))).toBe(4000);
  });

  it("remove referências [1] e blocos de código", () => {
    expect(toWhatsAppText("Custa R$ 10 [1] `mesmo`")).toBe("Custa R$ 10  mesmo".replace("  ", " ") .replace("R$ 10 mesmo", "R$ 10 mesmo"));
  });
});

describe("hours: horário de funcionamento", () => {
  const hours = { enabled: true, timezone: "America/Sao_Paulo", days: { seg: { open: true, from: "09:00", to: "18:00" }, dom: { open: false, from: "09:00", to: "18:00" } } };
  it("aberto na segunda às 10h (SP)", () => {
    // 2026-09-21 é segunda-feira; 13:00Z = 10:00 em São Paulo
    expect(isOpenNow(hours, new Date("2026-09-21T13:00:00Z"))).toBe(true);
  });
  it("fechado na segunda às 20h e no domingo", () => {
    expect(isOpenNow(hours, new Date("2026-09-21T23:00:00Z"))).toBe(false);
    expect(isOpenNow(hours, new Date("2026-09-20T15:00:00Z"))).toBe(false);
  });
  it("null quando desabilitado e descreve horário", () => {
    expect(isOpenNow({ ...hours, enabled: false })).toBeNull();
    expect(describeHours(hours)).toContain("Segunda: 09:00 às 18:00");
    expect(describeHours(hours)).toContain("Domingo: fechado");
  });
  it("atravessa a meia-noite", () => {
    const h = { enabled: true, timezone: "America/Sao_Paulo", days: { seg: { open: true, from: "18:00", to: "02:00" } } };
    expect(isOpenNow(h, new Date("2026-09-22T02:30:00Z"))).toBe(true); // 23:30 SP segunda
  });
});

describe("scheduler: debounce por contato", () => {
  it("reinicia o timer e roda uma vez", async () => {
    vi.useFakeTimers();
    const s = new MemoryScheduler();
    const run = vi.fn(async () => {});
    s.schedule("a", 1000, run);
    vi.advanceTimersByTime(600);
    s.schedule("a", 1000, run);
    vi.advanceTimersByTime(600);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    await vi.runOnlyPendingTimersAsync();
    expect(run).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("agenda nova rodada se chegar mensagem durante o processamento", async () => {
    vi.useFakeTimers();
    const s = new MemoryScheduler();
    let resolveFirst: () => void = () => {};
    const calls: number[] = [];
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          calls.push(Date.now());
          if (calls.length === 1) resolveFirst = resolve;
          else resolve();
        }),
    );
    s.schedule("a", 100, run);
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);
    s.schedule("a", 100, run); // durante o processamento
    resolveFirst();
    await vi.advanceTimersByTimeAsync(200);
    expect(run).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe("bot-config e prompt", () => {
  it("modelo pizzaria gera config completa com defaults", () => {
    const t = getTemplate("pizzaria")!;
    const cfg = defaultBotConfig({ ...t.config, identity: { ...t.config.identity, businessName: "Bella Massa" } });
    expect(cfg.identity.businessName).toBe("Bella Massa");
    expect(cfg.behavior.debounceSeconds).toBe(4);
    expect(cfg.actions.sendMenu.enabled).toBe(true);
    expect(botVariables(cfg)).toContain("nome_empresa");
  });

  it("aplica variáveis e monta prompt com base de conhecimento", () => {
    expect(applyVariables("Oi {{ nome }}, {{x}}!", { nome: "Ana" })).toBe("Oi Ana, !");
    const cfg = defaultBotConfig({ identity: { businessName: "Bella Massa" }, instructions: "Atenda a {{nome_empresa}}." });
    const prompt = buildSystemPrompt({ config: cfg, variables: {}, knowledge: ["Pizza mussarela R$ 45"], tools: ["chamar_atendente"], contactName: "Rafael" });
    expect(prompt).toContain("Atenda a Bella Massa.");
    expect(prompt).toContain("[1] Pizza mussarela R$ 45");
    expect(prompt).toContain("chamar_atendente");
    expect(prompt).toContain("Rafael");
  });
});

describe("texto: chunks e FAQ", () => {
  it("divide texto longo em trechos menores que o limite", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Parágrafo ${i}. ` + "Conteúdo relevante sobre o negócio. ".repeat(6)).join("\n\n");
    const chunks = chunkText(text, { maxChars: 600, overlap: 80 });
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.length <= 600)).toBe(true);
    expect(chunks.join(" ")).toContain("Parágrafo 39");
  });
  it("faq: serializa, lê e vira trechos", () => {
    const pairs = [{ q: "Entrega?", a: "Sim, 40 min." }, { q: "Pix?", a: "Aceitamos." }];
    const s = serializeFaq(pairs);
    expect(parseFaq(s)).toEqual(pairs);
    expect(faqToChunks(pairs)[0]).toBe("Pergunta: Entrega?\nResposta: Sim, 40 min.");
  });
  it("html vira texto", () => {
    expect(htmlToText("<h1>Oi</h1><script>x()</script><p>Tudo &amp; bem</p>")).toBe("Oi\nTudo & bem");
  });
});

describe("webhook-parser", () => {
  it("lê messages.upsert de texto", () => {
    const ev = parseWebhook(buildTextUpsertPayload({ instance: "x", remoteJid: "5511999@s.whatsapp.net", id: "ABC", text: "oi", pushName: "Ana" }));
    expect(ev.type).toBe("messages.upsert");
    if (ev.type === "messages.upsert") {
      expect(ev.message.phone).toBe("5511999");
      expect(ev.message.text).toBe("oi");
      expect(ev.message.pushName).toBe("Ana");
      expect(ev.message.isGroup).toBe(false);
    }
  });
  it("lê áudio, imagem e connection.update", () => {
    const audio = parseWebhook({ event: "messages.upsert", instance: "x", data: { key: { remoteJid: "1@s.whatsapp.net", id: "1" }, message: { audioMessage: { mimetype: "audio/ogg" } } } });
    expect(audio.type === "messages.upsert" && audio.message.type).toBe("audio");
    const img = parseWebhook({ event: "MESSAGES_UPSERT", instance: "x", data: { key: { remoteJid: "1@g.us", id: "2" }, message: { imageMessage: { caption: "foto" } } } });
    expect(img.type === "messages.upsert" && img.message.isGroup).toBe(true);
    const conn = parseWebhook({ event: "connection.update", instance: "x", data: { state: "open" } });
    expect(conn).toMatchObject({ type: "connection.update", state: "open" });
    expect(parseWebhook({ event: "messages.update", instance: "x", data: {} }).type).toBe("ignored");
  });
});

describe("crypto", () => {
  beforeAll(() => {
    process.env.APP_SECRET = "segredo-de-teste-com-mais-de-16-chars";
  });
  it("criptografa e descriptografa", async () => {
    const { encryptSecret, decryptSecret, maskSecret } = await import("@/server/crypto");
    const enc = encryptSecret("sk-abc123");
    expect(enc.startsWith("v1.")).toBe(true);
    expect(decryptSecret(enc)).toBe("sk-abc123");
    expect(maskSecret("sk-abcdefghijklmnop", 4)).toMatch(/^sk-a•+mnop$/);
  });
});

describe("engine: imagem (visão)", () => {
  function row(patch: Partial<MessageRow>): MessageRow {
    return {
      id: "m-" + Math.random(),
      number_id: "num-1",
      conversation_id: "conv-1",
      contact_id: "contact-1",
      external_id: null,
      direction: "in",
      sender: "contact",
      type: "text",
      text: null,
      transcript: null,
      media_mime: null,
      status: "received",
      model: null,
      tokens_in: null,
      tokens_out: null,
      latency_ms: null,
      meta: null,
      created_at: new Date(),
      ...patch,
    };
  }

  it("mensagens de texto consecutivas continuam mescladas numa mensagem só", () => {
    const messages = toModelMessages([row({ text: "Oi" }), row({ text: "Tudo bem?" })], "num-1");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: "user", content: "Oi\nTudo bem?" });
  });

  it("imagem com bytes em cache vira conteúdo multimodal (arquivo + legenda)", () => {
    cacheImage("num-1", "wa-img-1", "QkFTRTY0", "image/jpeg");
    const messages = toModelMessages([row({ type: "image", external_id: "wa-img-1", text: "Isso já saiu do forno assim mesmo?" })], "num-1");
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toEqual([
      { type: "file", data: "QkFTRTY0", mediaType: "image/jpeg" },
      { type: "text", text: "Isso já saiu do forno assim mesmo?" },
    ]);
  });

  it("imagem sem nada em cache (expirado/nunca baixado) volta a ser só o resumo em texto", () => {
    const messages = toModelMessages([row({ type: "image", external_id: "wa-img-nao-cacheado", text: "legenda" })], "num-1");
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('[o cliente enviou uma imagem: "legenda"]');
  });

  it("cache é de uso único: a mesma imagem não é reaproveitada numa segunda leitura do histórico", () => {
    cacheImage("num-1", "wa-img-2", "QUJD", "image/png");
    toModelMessages([row({ type: "image", external_id: "wa-img-2", text: "" })], "num-1");
    const second = toModelMessages([row({ type: "image", external_id: "wa-img-2", text: "" })], "num-1");
    expect(second[0].content).toBe("[o cliente enviou uma imagem]");
  });
});

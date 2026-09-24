"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Badge, Button, Card, Input, Spinner } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn, formatNumber } from "@/lib/utils";
import type { BotConfig } from "@/shared/bot-config";

type PlaygroundResult = {
  bubbles: string[];
  toolCalls: { name: string; input: unknown }[];
  knowledge: { id: string; content: string; distance: number }[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  latencyMs: number;
  simulated: boolean;
  systemPrompt: string;
  category: string | null;
};

type TurnMeta = {
  toolCalls: { name: string; input: unknown }[];
  knowledge: { id: string; content: string; distance: number }[];
  model: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
  simulated: boolean;
  category: string | null;
};

type ChatTurn = { role: "user" | "assistant"; bubbles: string[]; meta?: TurnMeta };

export function Playground({ botId, config }: { botId: string; config: BotConfig }) {
  const toast = useToast();
  const [turns, setTurns] = React.useState<ChatTurn[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [systemPrompt, setSystemPrompt] = React.useState("");
  const [showPrompt, setShowPrompt] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, sending]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const history = turns.map((t) => ({ role: t.role, text: t.bubbles.join("\n\n") }));
    setTurns((prev) => [...prev, { role: "user", bubbles: [text] }]);
    setSending(true);
    try {
      const res = await fetch("/api/playground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botId, config, variables: {}, history, userText: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao testar o bot.");
      const result = data as PlaygroundResult;
      setSystemPrompt(result.systemPrompt);
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          bubbles: result.bubbles,
          meta: { toolCalls: result.toolCalls, knowledge: result.knowledge, model: result.model, latencyMs: result.latencyMs, usage: result.usage, simulated: result.simulated, category: result.category },
        },
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-info-soft px-4 py-2 text-xs text-info">
          Testa a configuração atual (mesmo sem salvar). A base de conhecimento usa o que já está indexado.
        </div>
        <div
          ref={listRef}
          className="flex h-[420px] flex-col gap-2 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,rgba(230,237,243,0.04)_1px,transparent_0)] bg-[length:18px_18px] p-4"
        >
          {turns.length === 0 ? (
            <p className="m-auto max-w-[220px] text-center text-sm text-muted">Envie uma mensagem para testar o bot com a configuração atual.</p>
          ) : (
            turns.map((t, ti) => (
              <div key={ti} className={cn("flex flex-col gap-1", t.role === "user" ? "items-end" : "items-start")}>
                {t.bubbles.map((b, bi) => (
                  <div key={bi} className={cn("max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm shadow-sm", t.role === "user" ? "bg-wa-out text-white" : "bg-wa-in text-foreground")}>
                    {b}
                  </div>
                ))}
                {t.role === "assistant" && t.meta ? (
                  <div className="max-w-[85%] space-y-1.5">
                    {t.meta.toolCalls.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {t.meta.toolCalls.map((tc, i) => (
                          <Badge key={i} tone="accent">
                            🔔 {tc.name}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {t.meta.knowledge.length > 0 ? (
                      <details className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-muted">
                        <summary className="cursor-pointer select-none text-foreground/80">Trechos usados ({t.meta.knowledge.length})</summary>
                        <div className="mt-1.5 space-y-1.5">
                          {t.meta.knowledge.map((k) => (
                            <p key={k.id} className="whitespace-pre-wrap border-t border-border pt-1.5 first:border-t-0 first:pt-0">
                              {k.content}
                            </p>
                          ))}
                        </div>
                      </details>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-subtle">
                      {t.meta.simulated ? <Badge tone="warning">IA simulada — configure a chave OpenAI em Integrações</Badge> : null}
                      {t.meta.category ? <Badge tone="info">categoria: {t.meta.category}</Badge> : null}
                      <span>{t.meta.model}</span>
                      <span>{t.meta.latencyMs} ms</span>
                      <span>{formatNumber(t.meta.usage.inputTokens + t.meta.usage.outputTokens)} tokens</span>
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          )}
          {sending ? (
            <div className="flex items-center gap-1.5 self-start rounded-lg bg-wa-in px-3 py-2 text-sm text-muted">
              <Spinner className="h-3.5 w-3.5" /> digitando…
            </div>
          ) : null}
        </div>
        <div className="flex gap-2 border-t border-border p-3">
          <Input
            value={input}
            placeholder="Mensagem do cliente de teste…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={sending}
          />
          <Button onClick={handleSend} loading={sending} disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => setTurns([])} disabled={!turns.length}>
          Limpar conversa
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowPrompt(true)} disabled={!systemPrompt}>
          Ver prompt
        </Button>
      </div>
      <Modal open={showPrompt} onClose={() => setShowPrompt(false)} title="Prompt do sistema" size="lg">
        <pre className="whitespace-pre-wrap text-xs">{systemPrompt}</pre>
      </Modal>
    </div>
  );
}

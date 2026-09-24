"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Field, Input, Switch, Textarea } from "@/components/ui/primitives";
import type { BotConfig } from "@/shared/bot-config";

export function ComportamentoTab({ config, patch }: { config: BotConfig; patch: (p: Record<string, unknown>) => void }) {
  const b = config.behavior;
  const cat = config.categorization;
  const [kw, setKw] = React.useState("");
  const [catInput, setCatInput] = React.useState("");

  function addKeyword() {
    const v = kw.trim();
    if (!v) return;
    if (b.handoffKeywords.includes(v)) {
      setKw("");
      return;
    }
    patch({ behavior: { handoffKeywords: [...b.handoffKeywords, v] } });
    setKw("");
  }
  function removeKeyword(v: string) {
    patch({ behavior: { handoffKeywords: b.handoffKeywords.filter((k) => k !== v) } });
  }

  function addCategory() {
    const v = catInput.trim();
    if (!v || cat.options.length >= 12) {
      setCatInput("");
      return;
    }
    if (cat.options.includes(v)) {
      setCatInput("");
      return;
    }
    patch({ categorization: { options: [...cat.options, v] } });
    setCatInput("");
  }
  function removeCategory(v: string) {
    patch({ categorization: { options: cat.options.filter((c) => c !== v) } });
  }

  return (
    <div className="space-y-5">
      <Field label="Saudação" hint="Primeira mensagem enviada a um contato novo.">
        <Textarea value={b.greeting} onChange={(e) => patch({ behavior: { greeting: e.target.value } })} maxLength={600} className="min-h-[80px]" />
      </Field>
      <Field label="Mensagem fora do horário">
        <Textarea value={b.offHoursMessage} onChange={(e) => patch({ behavior: { offHoursMessage: e.target.value } })} maxLength={600} className="min-h-[80px]" />
      </Field>
      <Field label="Quando não souber responder">
        <Textarea value={b.unknownAnswer} onChange={(e) => patch({ behavior: { unknownAnswer: e.target.value } })} maxLength={600} className="min-h-[80px]" />
      </Field>

      <Field label="Palavras que chamam um humano" hint="Se o cliente escrever uma delas, o bot oferece falar com a equipe.">
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface-1 p-2">
          {b.handoffKeywords.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-xs text-foreground">
              {k}
              <button type="button" onClick={() => removeKeyword(k)} aria-label={`Remover ${k}`} className="text-muted hover:text-danger">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addKeyword();
              }
            }}
            placeholder="digite e Enter…"
            className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground outline-none placeholder:text-subtle"
          />
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pausa após humano responder (horas)" hint="O bot fica em silêncio por esse tempo.">
          <Input type="number" min={0} max={72} value={b.pauseHoursOnHuman} onChange={(e) => patch({ behavior: { pauseHoursOnHuman: e.target.value === "" ? 0 : Number(e.target.value) } })} />
        </Field>
        <Field label="Espera antes de responder (segundos)" hint="Junta mensagens seguidas do cliente antes de responder.">
          <Input type="number" min={0} max={30} value={b.debounceSeconds} onChange={(e) => patch({ behavior: { debounceSeconds: e.target.value === "" ? 0 : Number(e.target.value) } })} />
        </Field>
        <Field label="Tamanho máx. de cada balão (caracteres)" hint="Respostas longas são divididas em mais de uma mensagem.">
          <Input type="number" min={120} max={1200} value={b.maxBubbleChars} onChange={(e) => patch({ behavior: { maxBubbleChars: e.target.value === "" ? 0 : Number(e.target.value) } })} />
        </Field>
        <Field label="Mensagens de histórico" hint="Quantas mensagens recentes a IA enxerga da conversa.">
          <Input type="number" min={2} max={60} value={b.historyMessages} onChange={(e) => patch({ behavior: { historyMessages: e.target.value === "" ? 0 : Number(e.target.value) } })} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Switch checked={b.replyToAudio} onChange={(v) => patch({ behavior: { replyToAudio: v } })} label="Responder a áudios" />
        <Switch checked={b.replyToImages} onChange={(v) => patch({ behavior: { replyToImages: v } })} label="Responder a imagens" />
        <Switch checked={b.ignoreGroups} onChange={(v) => patch({ behavior: { ignoreGroups: v } })} label="Ignorar grupos" />
      </div>

      <div className="border-t border-border pt-5">
        <Switch checked={cat.enabled} onChange={(v) => patch({ categorization: { enabled: v } })} label="Categorizar as conversas automaticamente" />
        <p className="mt-1 text-xs text-subtle">O próprio bot marca o assunto de cada conversa (o cliente nunca vê isso). Dá para corrigir na mão na tela da conversa, e filtrar por categoria na lista.</p>
        {cat.enabled ? (
          <Field label="Categorias" hint="Até 12. O bot escolhe sempre uma dessas." className="mt-3">
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface-1 p-2">
              {cat.options.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-xs text-foreground">
                  {c}
                  <button type="button" onClick={() => removeCategory(c)} aria-label={`Remover ${c}`} className="text-muted hover:text-danger">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {cat.options.length < 12 ? (
                <input
                  value={catInput}
                  onChange={(e) => setCatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCategory();
                    }
                  }}
                  placeholder="digite e Enter…"
                  className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground outline-none placeholder:text-subtle"
                />
              ) : null}
            </div>
          </Field>
        ) : null}
      </div>
    </div>
  );
}

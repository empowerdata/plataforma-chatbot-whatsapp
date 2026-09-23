"use client";

import { Field, Input, Select, Switch } from "@/components/ui/primitives";
import type { BotConfig } from "@/shared/bot-config";

export function IdentidadeTab({ config, patch }: { config: BotConfig; patch: (p: Record<string, unknown>) => void }) {
  const i = config.identity;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do assistente" hint="Como o bot se apresenta na conversa.">
          <Input value={i.assistantName} onChange={(e) => patch({ identity: { assistantName: e.target.value } })} maxLength={40} />
        </Field>
        <Field label="Nome do negócio">
          <Input value={i.businessName} onChange={(e) => patch({ identity: { businessName: e.target.value } })} maxLength={80} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Segmento" hint="Ex.: pizzaria, salão, clínica…">
          <Input value={i.segment} onChange={(e) => patch({ identity: { segment: e.target.value } })} maxLength={60} />
        </Field>
        <Field label="Tom de voz">
          <Select value={i.tone} onChange={(e) => patch({ identity: { tone: e.target.value } })}>
            <option value="amigavel">Amigável</option>
            <option value="formal">Formal</option>
            <option value="descontraido">Descontraído</option>
          </Select>
        </Field>
      </div>
      <Switch checked={i.useEmoji} onChange={(v) => patch({ identity: { useEmoji: v } })} label="Usar emojis nas respostas" />
    </div>
  );
}

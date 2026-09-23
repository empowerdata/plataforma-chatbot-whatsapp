"use client";

import { Field, Input, Select } from "@/components/ui/primitives";
import type { BotConfig } from "@/shared/bot-config";

export function ModeloTab({
  config,
  patch,
  chatModelOptions,
}: {
  config: BotConfig;
  patch: (p: Record<string, unknown>) => void;
  chatModelOptions: { id: string; label: string; hint: string }[];
}) {
  const m = config.model;
  return (
    <div className="space-y-4">
      <Field label="Modelo de IA">
        <Select value={m.name} onChange={(e) => patch({ model: { name: e.target.value } })}>
          <option value="">Padrão da conta</option>
          {chatModelOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} — {o.hint}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={`Temperatura: ${m.temperature.toFixed(1)}`} hint="Mais alto = respostas mais criativas/variadas; mais baixo = mais previsíveis.">
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.1}
          value={m.temperature}
          onChange={(e) => patch({ model: { temperature: Number(e.target.value) } })}
          className="w-full accent-accent"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Máx. de tokens na resposta">
          <Input type="number" min={64} max={4000} value={m.maxOutputTokens} onChange={(e) => patch({ model: { maxOutputTokens: e.target.value === "" ? 0 : Number(e.target.value) } })} />
        </Field>
        <Field label="Trechos de conhecimento por resposta" hint="Quantos trechos da base de conhecimento entram em cada resposta.">
          <Input type="number" min={0} max={12} value={m.ragChunks} onChange={(e) => patch({ model: { ragChunks: e.target.value === "" ? 0 : Number(e.target.value) } })} />
        </Field>
      </div>
    </div>
  );
}

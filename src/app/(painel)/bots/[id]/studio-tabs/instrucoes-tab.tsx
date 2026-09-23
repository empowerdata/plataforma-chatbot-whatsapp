"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Badge, Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { botVariables, type BotConfig } from "@/shared/bot-config";

export function InstrucoesTab({ config, patch }: { config: BotConfig; patch: (p: Record<string, unknown>) => void }) {
  const vars = React.useMemo(() => botVariables(config), [config]);

  function updateRule(i: number, value: string) {
    const rules = [...config.rules];
    rules[i] = value;
    patch({ rules });
  }
  function addRule() {
    patch({ rules: [...config.rules, ""] });
  }
  function removeRule(i: number) {
    patch({ rules: config.rules.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-5">
      <Field
        label="Instruções principais"
        hint="Explique como o bot deve se comportar. Use {{nome_empresa}}, {{nome_assistente}} e outras variáveis — elas são substituídas pelos dados de cada número."
      >
        <Textarea value={config.instructions} onChange={(e) => patch({ instructions: e.target.value })} className="min-h-[320px] font-mono text-sm" maxLength={12000} />
      </Field>

      {vars.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-subtle">Variáveis usadas:</span>
          {vars.map((v) => (
            <Badge key={v} tone="info">{`{{${v}}}`}</Badge>
          ))}
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Regras curtas</span>
          <Button size="sm" variant="outline" onClick={addRule}>
            <Plus className="h-3.5 w-3.5" /> Regra
          </Button>
        </div>
        <div className="space-y-2">
          {config.rules.length === 0 ? <p className="text-xs text-subtle">Nenhuma regra adicional.</p> : null}
          {config.rules.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={r} onChange={(e) => updateRule(i, e.target.value)} maxLength={300} />
              <button type="button" onClick={() => removeRule(i)} className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger" aria-label="Remover regra">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

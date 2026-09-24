"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { StageKind } from "@/shared/crm-templates";
import type { CrmActions, StageDraft, StageView } from "./types";

const KIND_LABEL: Record<StageKind, string> = { open: "Em andamento", won: "Ganho (virou cliente)", lost: "Perda" };

/**
 * Editar o funil do cliente: renomear, reordenar, criar e remover etapas.
 * O tipo de cada etapa é o que faz a conversão ser calculada; "pede data"
 * faz a tela perguntar dia e hora ao mover alguém para ela.
 */
export function StageEditor({ stages, actions, onClose, onSaved }: { stages: StageView[]; actions: CrmActions; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [rows, setRows] = React.useState<(StageDraft & { key: string; count: number })[]>(() => stages.map((s) => ({ key: s.id, id: s.id, name: s.name, kind: s.kind, asksDate: s.asksDate, count: s.count })));
  const [saving, setSaving] = React.useState(false);

  const patch = (i: number, p: Partial<StageDraft>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setRows((r) => {
      const j = i + d;
      if (j < 0 || j >= r.length) return r;
      const copy = [...r];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  async function save() {
    setSaving(true);
    try {
      const res = await actions.saveStages(rows.map(({ id, name, kind, asksDate }) => ({ id, name, kind, asksDate })));
      if (res.error) toast.error(res.error);
      else {
        toast.success("Funil atualizado.");
        onSaved();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  const removed = stages.filter((s) => !rows.some((r) => r.id === s.id) && s.count > 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Etapas do funil"
      description="A ordem aqui é a ordem das colunas. O tipo diz se a etapa conta como andamento, ganho ou perda nos indicadores."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            Salvar funil
          </Button>
        </>
      }
    >
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.key} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2 py-2">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 text-subtle hover:text-foreground disabled:opacity-30" aria-label="Subir">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="rounded p-0.5 text-subtle hover:text-foreground disabled:opacity-30" aria-label="Descer">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <input value={r.name} onChange={(e) => patch(i, { name: e.target.value })} maxLength={40} placeholder="Nome da etapa" className="h-8 min-w-[140px] flex-1 rounded-md border border-border bg-surface-1 px-2.5 text-[13px] text-foreground focus:border-accent/60 focus:outline-none" />
            <select value={r.kind} onChange={(e) => patch(i, { kind: e.target.value as StageKind })} className="h-8 rounded-md border border-border bg-surface-1 px-2 text-xs text-foreground focus:outline-none">
              {(Object.keys(KIND_LABEL) as StageKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted" title="Ao mover alguém para esta etapa, a tela pede dia e hora">
              <input type="checkbox" checked={r.asksDate} onChange={(e) => patch(i, { asksDate: e.target.checked })} className="accent-[var(--color-accent)]" />
              pede data
            </label>
            <span className="w-14 text-right text-[11px] tabular-nums text-subtle">{r.count ? `${r.count} lead${r.count === 1 ? "" : "s"}` : ""}</span>
            <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-danger" aria-label={`Remover ${r.name}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setRows((r) => [...r, { key: `novo-${Date.now()}`, name: "", kind: "open", asksDate: false, count: 0 }])} className="mt-3 inline-flex items-center gap-1.5 text-xs text-accent hover:underline">
        <Plus className="h-3.5 w-3.5" /> Adicionar etapa
      </button>
      {removed.length ? <p className="mt-3 text-xs text-warning">Os leads de {removed.map((s) => `"${s.name}"`).join(", ")} vão para a primeira etapa em andamento.</p> : null}
    </Modal>
  );
}

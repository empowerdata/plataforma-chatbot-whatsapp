"use client";

import * as React from "react";
import { Modal } from "@/components/ui/dialog";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { LOST_REASONS } from "@/shared/crm-templates";

type StageLike = { id: string; name: string; kind: "open" | "won" | "lost"; asksDate: boolean };
export type MoveExtras = { appointmentAt?: string; lostReason?: string };

type Pending = { stage: StageLike; leadName: string; resolve: (v: MoveExtras | null) => void };

/** Amanhã às 9h, no formato do campo datetime-local (hora de Brasília). */
function tomorrowNine(): string {
  const d = new Date(Date.now() + 86400_000 - 3 * 3600_000);
  return `${d.toISOString().slice(0, 10)}T09:00`;
}

/**
 * Pede o que falta para mover um lead: data e hora (etapas de agendamento) ou
 * o motivo (etapas de perda). Para as outras etapas resolve na hora, sem janela.
 * Uso: `const extras = await ask(stage, nome); if (extras) mover(...)`.
 */
export function useStageMove() {
  const [pending, setPending] = React.useState<Pending | null>(null);

  const ask = React.useCallback((stage: StageLike, leadName: string): Promise<MoveExtras | null> => {
    if (!stage.asksDate && stage.kind !== "lost") return Promise.resolve({});
    return new Promise((resolve) => setPending({ stage, leadName, resolve }));
  }, []);

  const dialog = pending ? <MoveDialog key={pending.stage.id + pending.leadName} pending={pending} onDone={() => setPending(null)} /> : null;
  return { ask, dialog };
}

function MoveDialog({ pending, onDone }: { pending: Pending; onDone: () => void }) {
  const { stage, leadName, resolve } = pending;
  const [when, setWhen] = React.useState(tomorrowNine());
  const [reason, setReason] = React.useState<string>("");
  const [other, setOther] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function close(v: MoveExtras | null) {
    resolve(v);
    onDone();
  }

  function confirm() {
    if (stage.asksDate) {
      if (!when) return setError("Informe a data e a hora.");
      return close({ appointmentAt: when });
    }
    const final = reason === "Outro" ? other.trim() : reason;
    if (!final) return setError(reason === "Outro" ? "Escreva o motivo." : "Escolha o motivo.");
    close({ lostReason: final });
  }

  return (
    <Modal
      open
      onClose={() => close(null)}
      size="sm"
      title={`Mover para ${stage.name}`}
      description={leadName}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(null)}>
            Cancelar
          </Button>
          <Button onClick={confirm}>Mover</Button>
        </>
      }
    >
      {stage.asksDate ? (
        <Field label="Data e hora" hint="Aparece no cartão e na tela Hoje no dia.">
          <Input type="datetime-local" value={when} onChange={(e) => (setWhen(e.target.value), setError(null))} autoFocus />
        </Field>
      ) : (
        <div className="space-y-3">
          <Field label="Por que não deu certo?" hint="O motivo entra nos indicadores do funil.">
            <Select value={reason} onChange={(e) => (setReason(e.target.value), setError(null))} autoFocus>
              <option value="" disabled>
                Escolha o motivo
              </option>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          {reason === "Outro" ? <Input value={other} onChange={(e) => (setOther(e.target.value), setError(null))} placeholder="Qual foi o motivo?" maxLength={200} /> : null}
        </div>
      )}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </Modal>
  );
}

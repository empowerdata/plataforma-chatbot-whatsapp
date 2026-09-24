"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, Check, Clock, Flag, MessageCircle, Pencil, Trash2, X } from "lucide-react";
import { useDialogs } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useStageMove } from "./move-dialog";
import type { CrmActions, LeadDetail, StageView } from "./types";

const inputCls = "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground placeholder:text-subtle focus:border-accent/60 focus:outline-none";

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-b border-border px-4 py-3.5", className)}>
      <h4 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-subtle">{title}</h4>
      {children}
    </section>
  );
}

function reaisToCents(v: string): number | null | "invalid" {
  const t = v.trim().replace(/[R$\s.]/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : "invalid";
}

/**
 * Ficha do lead: etapa, próxima ação, agendamento, interesse, valor, notas e
 * a linha do tempo. Cada campo salva sozinho ao sair dele (ou no botão, nos de data).
 */
export function LeadDrawer({ lead, stages, actions, conversationHref, onClose, onChanged }: { lead: LeadDetail; stages: StageView[]; actions: CrmActions; conversationHref: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { confirmDialog, promptDialog } = useDialogs();
  const { ask, dialog } = useStageMove();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [nextAt, setNextAt] = React.useState(lead.nextActionAt ?? "");
  const [nextNote, setNextNote] = React.useState(lead.nextActionNote ?? "");
  const [appt, setAppt] = React.useState(lead.appointmentAt ?? "");
  const [interest, setInterest] = React.useState(lead.interest ?? "");
  const [value, setValue] = React.useState(lead.valueCents != null ? String(lead.valueCents / 100).replace(".", ",") : "");
  const [notes, setNotes] = React.useState(lead.notes);
  const stage = stages.find((s) => s.id === lead.stageId);

  async function run(key: string, fn: () => Promise<{ error: string | null }>, ok?: string) {
    setBusy(key);
    try {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        if (ok) toast.success(ok);
        onChanged();
      }
      return !res.error;
    } finally {
      setBusy(null);
    }
  }

  async function moveTo(stageId: string) {
    const to = stages.find((s) => s.id === stageId);
    if (!to || to.id === lead.stageId) return;
    const extras = await ask(to, lead.name);
    if (!extras) return;
    await run("stage", () => actions.move(lead.id, to.id, extras), `Movido para ${to.name}.`);
  }

  const showAppointment = !!stage?.asksDate || !!lead.appointmentAt;

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-border bg-surface-1 sm:w-[380px]">
      {dialog}
      <div className="flex items-start gap-3 border-b border-border px-4 py-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[13px] font-semibold text-foreground/80">{lead.initials}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-[15px] font-semibold text-foreground">{lead.name}</span>
            <button
              type="button"
              title="Editar nome"
              onClick={async () => {
                const v = await promptDialog("Nome deste lead:", lead.rawName ?? "", { title: "Nome", confirmLabel: "Salvar" });
                if (v !== null) void run("name", () => actions.update(lead.id, { name: v }), "Nome atualizado.");
              }}
              className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
          <div className="text-xs text-muted">
            {lead.phone}
            {lead.source ? ` · ${lead.source}` : ""}
          </div>
          {lead.signal ? <div className={cn("mt-1 text-[11.5px]", lead.signal.kind === "aguardando" ? "text-danger" : "text-warning")}>{lead.signal.label}</div> : null}
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Fechar ficha">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-2 border-b border-border px-4 py-3">
        <select
          value={lead.stageId ?? ""}
          disabled={busy === "stage"}
          onChange={(e) => void moveTo(e.target.value)}
          aria-label="Etapa"
          className="h-8 min-w-0 flex-1 rounded-md border border-border-strong bg-background px-2 text-[13px] text-foreground focus:border-accent/60 focus:outline-none"
        >
          {!lead.stageId ? <option value="">Sem etapa</option> : null}
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.kind === "won" ? " (ganho)" : s.kind === "lost" ? " (perda)" : ""}
            </option>
          ))}
        </select>
        {conversationHref ? (
          <Link href={conversationHref} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border-strong px-2.5 text-[13px] text-foreground hover:bg-surface-2">
            <MessageCircle className="h-3.5 w-3.5" /> Conversa
          </Link>
        ) : null}
      </div>
      {lead.lostReason ? <p className="border-b border-border px-4 py-2 text-xs text-muted">Motivo da perda: {lead.lostReason}</p> : null}

      <Section title="Próxima ação">
        <div className="space-y-2">
          <input value={nextNote} onChange={(e) => setNextNote(e.target.value)} placeholder="O que fazer (ex.: confirmar horário de terça)" maxLength={200} className={inputCls} />
          <div className="flex gap-2">
            <input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} className={cn(inputCls, "flex-1")} aria-label="Quando" />
            <button
              type="button"
              disabled={busy === "next" || !nextAt}
              onClick={() => void run("next", () => actions.update(lead.id, { nextActionAt: nextAt, nextActionNote: nextNote }), "Próxima ação marcada.")}
              className="h-8 shrink-0 rounded-md bg-surface-3 px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-40"
            >
              Salvar
            </button>
          </div>
          {lead.nextActionAt ? (
            <button
              type="button"
              onClick={() =>
                void run("done", () => actions.completeNextAction(lead.id), "Próxima ação concluída.").then((ok) => {
                  if (ok) {
                    setNextAt("");
                    setNextNote("");
                  }
                })
              }
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
            >
              <Check className="h-3.5 w-3.5" /> Marcar como feita
            </button>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] text-subtle">
              <Flag className="h-3 w-3" /> Aparece na tela Hoje no dia marcado.
            </p>
          )}
        </div>
      </Section>

      {showAppointment ? (
        <Section title="Agendamento">
          <div className="flex gap-2">
            <input type="datetime-local" value={appt} onChange={(e) => setAppt(e.target.value)} className={cn(inputCls, "flex-1")} aria-label="Data e hora do agendamento" />
            <button
              type="button"
              disabled={busy === "appt" || appt === (lead.appointmentAt ?? "")}
              onClick={() => void run("appt", () => actions.update(lead.id, { appointmentAt: appt || null }), appt ? "Agendamento salvo." : "Agendamento removido.")}
              className="h-8 shrink-0 rounded-md bg-surface-3 px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-40"
            >
              Salvar
            </button>
          </div>
          {lead.appointmentLabel ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-foreground/85">
              <CalendarClock className="h-3.5 w-3.5 text-muted" /> {lead.appointmentLabel}
            </p>
          ) : null}
        </Section>
      ) : null}

      <Section title="Detalhes">
        <div className="space-y-2.5">
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted">Interesse</span>
            <input
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              onBlur={() => interest !== (lead.interest ?? "") && void run("interest", () => actions.update(lead.id, { interest }))}
              placeholder={lead.interestSuggestion ? `Sugestão: ${lead.interestSuggestion}` : "Ex.: avaliação, plano mensal"}
              maxLength={60}
              className={inputCls}
            />
            {!lead.interest && lead.interestSuggestion ? (
              <button type="button" onClick={() => (setInterest(lead.interestSuggestion!), void run("interest", () => actions.update(lead.id, { interest: lead.interestSuggestion! }), "Interesse confirmado."))} className="mt-1 text-[11.5px] text-accent hover:underline">
                Usar a sugestão do bot: {lead.interestSuggestion}
              </button>
            ) : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted">Valor estimado (R$)</span>
            <input
              value={value}
              inputMode="decimal"
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => {
                const cents = reaisToCents(value);
                if (cents === "invalid") return toast.error("Valor inválido. Use só números, ex.: 350 ou 350,00.");
                if (cents !== lead.valueCents) void run("value", () => actions.update(lead.id, { valueCents: cents }));
              }}
              placeholder="Ex.: 350"
              className={inputCls}
            />
          </label>
          <div className="flex justify-between text-xs">
            <span className="text-muted">Chegou em</span>
            <span className="text-foreground/85">{lead.createdLabel}</span>
          </div>
        </div>
      </Section>

      <Section title="Notas internas">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== lead.notes && void run("notes", () => actions.update(lead.id, { notes }))}
          rows={4}
          placeholder="O que importa sobre esta pessoa… (sem detalhes de saúde)"
          className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-subtle focus:border-accent/60 focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-subtle">Só a equipe vê · salva ao sair do campo</p>
      </Section>

      <Section title="Linha do tempo" className="border-b-0">
        {lead.timeline.length === 0 ? (
          <p className="text-xs text-muted">Nada ainda.</p>
        ) : (
          <ol className="space-y-2.5">
            {lead.timeline.map((t) => (
              <li key={t.id} className="flex gap-2.5 text-xs">
                <Clock className="mt-0.5 h-3 w-3 shrink-0 text-subtle" />
                <div className="min-w-0">
                  <div className="text-foreground/90">
                    {t.label}
                    {t.actor && t.actor !== "sistema" ? <span className="text-subtle"> · {t.actor}</span> : null}
                  </div>
                  {t.detail ? <div className="text-muted">{t.detail}</div> : null}
                  <div className="text-[11px] text-subtle">{t.when}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          onClick={async () => {
            const ok = await confirmDialog(`Apagar ${lead.name} do funil, junto com as conversas e mensagens? Use quando a pessoa pedir para ter os dados apagados. Não dá para desfazer.`, { title: "Apagar lead e histórico", destructive: true, confirmLabel: "Apagar tudo" });
            if (ok && (await run("delete", () => actions.deleteLead(lead.id), "Lead apagado."))) onClose();
          }}
          className="mt-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" /> Apagar lead e histórico (pedido LGPD)
        </button>
      </Section>
    </aside>
  );
}

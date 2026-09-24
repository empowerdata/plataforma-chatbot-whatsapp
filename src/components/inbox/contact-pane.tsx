"use client";

import * as React from "react";
import { Ban, Pencil, ShieldCheck, X } from "lucide-react";
import { Badge, Switch } from "@/components/ui/primitives";
import { useDialogs } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Avatar, botDot, botExplanation } from "./parts";
import type { InboxActions, InboxConversation } from "./types";

type SaveState = "idle" | "saving" | "saved" | "error";

export function ContactPane({
  conversation: c,
  audience,
  actions,
  onChanged,
  onClose,
  className,
}: {
  conversation: InboxConversation;
  audience: "staff" | "client";
  actions: InboxActions;
  onChanged: () => void;
  onClose?: () => void;
  className?: string;
}) {
  const toast = useToast();
  const { confirmDialog, promptDialog } = useDialogs();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ error: string | null }>, ok: string) {
    setBusy(key);
    try {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        toast.success(ok);
        onChanged();
      }
    } finally {
      setBusy(null);
    }
  }

  const botOn = c.bot.kind === "active";
  const botLocked = c.bot.kind === "blocked" || c.bot.kind === "number_off" || c.bot.kind === "no_bot";

  return (
    <aside className={cn("flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface-1", className)}>
      {onClose ? (
        <div className="flex justify-end px-2 pt-2 2xl:hidden">
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-1.5 border-b border-border px-5 pb-5 pt-4 text-center 2xl:pt-6">
        <Avatar initials={c.initials} bot={botDot(c.bot)} size="lg" />
        <div className="mt-1 flex max-w-full items-center gap-1">
          <span className="truncate text-sm font-semibold text-foreground">{c.contact.name ?? c.contact.pushName ?? c.contact.phone}</span>
          <button
            type="button"
            title="Editar nome"
            onClick={async () => {
              const value = await promptDialog("Como este contato deve aparecer:", c.contact.name ?? c.contact.pushName ?? "", { title: "Nome do contato", confirmLabel: "Salvar" });
              if (value !== null) void run("rename", () => actions.rename(c.id, value), "Nome atualizado.");
            }}
            className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
        <span className="text-xs text-muted">{c.contact.phone}</span>
        {c.contact.pushName && c.contact.name && c.contact.pushName !== c.contact.name ? <span className="text-[11px] text-subtle">no WhatsApp: {c.contact.pushName}</span> : null}
        <Badge tone="neutral" className="mt-1">
          {c.numberLabel}
        </Badge>
      </div>

      <section className="space-y-2 border-b border-border px-5 py-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Bot nesta conversa</h4>
        <Switch checked={botOn} disabled={botLocked || busy === "bot"} onChange={(v) => run("bot", () => actions.setBot(c.id, v), v ? "Bot ligado nesta conversa." : "Bot desligado nesta conversa.")} label={botOn ? "Ligado" : "Desligado"} />
        <p className={cn("text-xs leading-relaxed", c.bot.kind === "paused" ? "text-warning" : "text-muted")}>{botExplanation(c.bot, audience)}</p>
      </section>

      <Notes key={c.id} conversation={c} actions={actions} />

      <section className="border-b border-border px-5 py-4">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">Detalhes</h4>
        <dl className="space-y-1.5 text-xs">
          <Row label="Primeiro contato" value={c.contact.firstSeenAt} />
          <Row label="Última atividade" value={c.contact.lastSeenAt} />
          <Row label="Conversa aberta em" value={c.createdAt} />
          <Row label="Mensagens" value={String(c.messageCount)} />
          {c.botName ? <Row label="Bot" value={c.botName} /> : null}
        </dl>
      </section>

      <section className="px-5 py-4">
        {c.contact.isBlocked ? (
          <button type="button" disabled={busy === "block"} onClick={() => run("block", () => actions.setBlocked(c.id, false), "Contato desbloqueado.")} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50">
            <ShieldCheck className="h-3.5 w-3.5" /> Desbloquear contato
          </button>
        ) : (
          <button
            type="button"
            disabled={busy === "block"}
            onClick={async () => {
              const ok = await confirmDialog("O bot deixa de responder este contato e nenhuma automação roda para ele. Dá para desbloquear quando quiser.", { title: "Bloquear este contato?", destructive: true, confirmLabel: "Bloquear" });
              if (ok) void run("block", () => actions.setBlocked(c.id, true), "Contato bloqueado.");
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-danger/80 hover:text-danger disabled:opacity-50"
          >
            <Ban className="h-3.5 w-3.5" /> Bloquear contato
          </button>
        )}
      </section>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-right text-foreground/90">{value}</dd>
    </div>
  );
}

/** Notas internas com salvamento automático (e ao sair do campo). */
function Notes({ conversation: c, actions }: { conversation: InboxConversation; actions: InboxActions }) {
  const toast = useToast();
  const [notes, setNotes] = React.useState(c.contact.notes);
  const [state, setState] = React.useState<SaveState>("idle");
  const saved = React.useRef(c.contact.notes);

  // Alguém salvou do outro lado e aqui não há edição pendente: acompanha o valor novo.
  React.useEffect(() => {
    if (notes === saved.current && c.contact.notes !== saved.current) {
      saved.current = c.contact.notes;
      setNotes(c.contact.notes);
    }
  }, [c.contact.notes, notes]);

  const save = React.useCallback(
    async (value: string) => {
      if (value === saved.current) return;
      setState("saving");
      const res = await actions.saveNotes(c.id, value);
      if (res.error) {
        setState("error");
        toast.error(res.error);
      } else {
        saved.current = value;
        setState("saved");
      }
    },
    [actions, c.id, toast],
  );

  React.useEffect(() => {
    if (notes === saved.current) return;
    const t = setTimeout(() => void save(notes), 900);
    return () => clearTimeout(t);
  }, [notes, save]);

  return (
    <section className="border-b border-border px-5 py-4">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">Notas internas</h4>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => void save(notes)}
        placeholder="Anote o que importa sobre este contato…"
        rows={4}
        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-subtle focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      <p className="mt-1 text-[11px] text-subtle">{state === "saving" ? "Salvando…" : state === "saved" ? "Salvo" : state === "error" ? "Não foi possível salvar" : "Salvo automaticamente · só a equipe vê"}</p>
    </section>
  );
}

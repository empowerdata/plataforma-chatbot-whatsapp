"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarClock, Check, Clock, Flag, MessageCircle, Snowflake } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useStageMove } from "./move-dialog";
import type { CrmActions, LeadCardView, StageView, TodayData } from "./types";

const POLL_MS = 30_000;

/**
 * "Hoje": a lista de trabalho do dia de quem atende. Agendamentos de hoje
 * (marcar se compareceu ou faltou), retornos combinados, quem está esperando
 * resposta e quem esfriou. Cada linha tem a ação mais provável ao lado.
 */
export function TodayScreen({ data, actions, leadHref: leadPrefix, conversationHref: convPrefix, funnelHref, clientSelect }: { data: TodayData; actions: CrmActions; /** Prefixo do link da ficha (o id do lead vai no fim). */ leadHref: string; /** Prefixo do link da conversa (o id da conversa vai no fim). */ conversationHref: string; funnelHref: string; clientSelect?: React.ReactNode }) {
  const leadHref = (id: string) => leadPrefix + id;
  const conversationHref = (id: string) => convPrefix + id;
  const router = useRouter();
  const toast = useToast();
  const { ask, dialog } = useStageMove();
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [router]);

  const won = data.stages.find((s) => s.kind === "won");
  const noShow = data.stages.find((s) => s.kind === "lost" && /falt|compar/i.test(s.name)) ?? data.stages.find((s) => s.kind === "lost");
  const lost = data.stages.find((s) => s.kind === "lost" && /perd/i.test(s.name)) ?? data.stages.find((s) => s.kind === "lost");

  async function run(key: string, fn: () => Promise<{ error: string | null }>, ok: string) {
    setBusy(key);
    try {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        toast.success(ok);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function moveTo(c: LeadCardView, stage: StageView | undefined, preset?: { lostReason?: string }) {
    if (!stage) return;
    const extras = preset ?? (await ask(stage, c.name));
    if (!extras) return;
    await run(c.id, () => actions.move(c.id, stage.id, extras), `${c.name}: ${stage.name}.`);
  }

  const todayRaw = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());
  const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1);
  const total = data.agenda.length + data.retorno.length + data.aguardando.length;

  return (
    <div className="animate-fade-in-up">
      {dialog}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Hoje</h1>
          <p className="mt-1 text-sm text-muted">
            {today} · {total ? `${total} pendência${total === 1 ? "" : "s"}` : "nada pendente por enquanto"}
          </p>
        </div>
        {clientSelect}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Block icon={CalendarCheck} title="Agendamentos de hoje" empty="Nenhum agendamento para hoje." items={data.agenda}>
          {(c) => (
            <Row key={c.id} card={c} href={leadHref(c.id)} meta={<span className="inline-flex items-center gap-1.5 text-foreground/85"><CalendarClock className="h-3 w-3 text-muted" />{c.appointment}</span>}>
              {won ? <RowAction busy={busy === c.id} onClick={() => void moveTo(c, won)}>Compareceu</RowAction> : null}
              {noShow ? <RowAction busy={busy === c.id} onClick={() => void moveTo(c, noShow, { lostReason: "Não compareceu" })}>Faltou</RowAction> : null}
            </Row>
          )}
        </Block>

        <Block icon={Flag} title="Retornos combinados" empty="Nenhum retorno para hoje." items={data.retorno}>
          {(c) => (
            <Row key={c.id} card={c} href={leadHref(c.id)} meta={<span className={cn("inline-flex items-center gap-1.5", c.nextAction?.overdue ? "text-danger" : "text-muted")}><Flag className="h-3 w-3" />{c.nextAction?.label}</span>}>
              {c.conversationId ? <RowLink href={conversationHref(c.conversationId)}>Conversa</RowLink> : null}
              <RowAction busy={busy === c.id} onClick={() => void run(c.id, () => actions.completeNextAction(c.id), "Retorno marcado como feito.")}>
                <Check className="h-3 w-3" /> Feito
              </RowAction>
            </Row>
          )}
        </Block>

        <Block icon={MessageCircle} title="Aguardando vocês" empty="Ninguém esperando resposta." items={data.aguardando} tone="danger">
          {(c) => (
            <Row key={c.id} card={c} href={leadHref(c.id)} meta={<span className="text-danger">{c.signal?.label}</span>}>
              {c.conversationId ? <RowLink href={conversationHref(c.conversationId)} primary>Responder</RowLink> : null}
            </Row>
          )}
        </Block>

        <Block icon={Snowflake} title={`Sem resposta há 3 dias ou mais`} empty="Ninguém esfriando." items={data.esfriando} tone="warning">
          {(c) => (
            <Row key={c.id} card={c} href={leadHref(c.id)} meta={<span className="inline-flex items-center gap-1.5 text-warning"><Clock className="h-3 w-3" />{c.signal?.label}</span>}>
              {c.conversationId ? <RowLink href={conversationHref(c.conversationId)}>Retomar</RowLink> : null}
              {lost ? <RowAction busy={busy === c.id} onClick={() => void moveTo(c, lost)}>Perdido</RowAction> : null}
            </Row>
          )}
        </Block>
      </div>

      {data.novos ? (
        <p className="mt-5 text-sm text-muted">
          {data.novos} lead{data.novos === 1 ? "" : "s"} em &quot;{data.stages.find((s) => s.kind === "open")?.name ?? "Novo"}&quot; esperando triagem.{" "}
          <Link href={funnelHref} className="text-accent hover:underline">
            Abrir o funil
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function Block({ icon: Icon, title, empty, items, tone, children }: { icon: React.ComponentType<{ className?: string }>; title: string; empty: string; items: LeadCardView[]; tone?: "danger" | "warning"; children: (c: LeadCardView) => React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Icon className={cn("h-4 w-4", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-subtle")} /> {title}
        </h2>
        <span className="text-xs tabular-nums text-muted">{items.length}</span>
      </header>
      {items.length ? <ul className="divide-y divide-border/60">{items.map(children)}</ul> : <p className="px-4 py-6 text-center text-xs text-subtle">{empty}</p>}
    </section>
  );
}

function Row({ card: c, href, meta, children }: { card: LeadCardView; href: string; meta: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Link href={href} className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-medium text-foreground hover:underline">{c.name}</span>
          {c.interest ? <span className={cn("shrink-0 text-[11px] text-subtle", c.interest.suggested && "italic")}>{c.interest.text}</span> : null}
        </div>
        <div className="mt-0.5 truncate text-[11.5px]">{meta}</div>
      </Link>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </li>
  );
}

function RowAction({ busy, onClick, children }: { busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" disabled={busy} onClick={onClick} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-foreground/85 transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-40">
      {children}
    </button>
  );
}

function RowLink({ href, primary, children }: { href: string; primary?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("inline-flex h-7 items-center rounded-md px-2 text-xs transition-colors", primary ? "bg-accent text-accent-foreground hover:bg-accent-strong" : "border border-border text-foreground/85 hover:border-border-strong hover:bg-surface-2")}>
      {children}
    </Link>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Clock, Flag, KanbanSquare, List, MessageCircle, Search, Settings2, X, XCircle } from "lucide-react";
import { Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { LeadDrawer } from "./lead-drawer";
import { useStageMove } from "./move-dialog";
import { StageEditor } from "./stage-editor";
import type { BoardFilters, CrmActions, CrmBoard, LeadCardView, LeadDetail, StageView } from "./types";

const POLL_MS = 20_000;

/**
 * Funil do cliente em quadro (colunas por etapa, arrastar para mover) ou em
 * lista (com ações em lote). Mesmo componente para a equipe e para o portal;
 * a página passa as ações já presas ao escopo da sessão.
 */
export function CrmBoardScreen({
  basePath,
  keepParams,
  board,
  filters,
  lead,
  actions,
  conversationBase,
  clientSelect,
}: {
  basePath: string;
  /** Parâmetros fixos da URL (ex.: `cl` do cliente, na tela da equipe). */
  keepParams?: Record<string, string>;
  board: CrmBoard;
  filters: BoardFilters;
  lead: LeadDetail | null;
  actions: CrmActions;
  conversationBase: string;
  clientSelect?: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [navPending, startNav] = React.useTransition();
  const [search, setSearch] = React.useState(filters.search);
  const [editing, setEditing] = React.useState(false);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overStage, setOverStage] = React.useState<string | null>(null);
  // Movimento otimista: o cartão já aparece na coluna nova enquanto o servidor confirma.
  const [moved, setMoved] = React.useState<Record<string, string>>({});
  const { ask, dialog } = useStageMove();

  const href = React.useCallback(
    (patch: Partial<BoardFilters & { lead: string | null }>) => {
      const next = { ...filters, lead: lead?.id ?? null, ...patch };
      const qs = new URLSearchParams(keepParams);
      if (next.search) qs.set("q", next.search);
      if (next.filter) qs.set("f", next.filter);
      if (next.view !== "quadro") qs.set("v", next.view);
      if (next.lead) qs.set("lead", next.lead);
      const s = qs.toString();
      return s ? `${basePath}?${s}` : basePath;
    },
    [basePath, filters, keepParams, lead?.id],
  );
  const go = React.useCallback((patch: Partial<BoardFilters & { lead: string | null }>) => startNav(() => router.replace(href(patch), { scroll: false })), [href, router]);
  const refresh = React.useCallback(() => router.refresh(), [router]);

  React.useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && !dragId) router.refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [router, dragId]);

  React.useEffect(() => {
    if (search === filters.search) return;
    const t = setTimeout(() => go({ search }), 350);
    return () => clearTimeout(t);
  }, [search, filters.search, go]);

  const cards = React.useMemo(() => board.cards.map((c) => (moved[c.id] && moved[c.id] !== c.stageId ? { ...c, stageId: moved[c.id] } : c)), [board.cards, moved]);

  async function moveCard(card: LeadCardView, stage: StageView) {
    if (card.stageId === stage.id) return;
    const extras = await ask(stage, card.name);
    if (!extras) return;
    setMoved((m) => ({ ...m, [card.id]: stage.id }));
    const res = await actions.move(card.id, stage.id, extras);
    if (res.error) {
      toast.error(res.error);
      setMoved(({ [card.id]: _drop, ...rest }) => {
        void _drop;
        return rest;
      });
    } else refresh();
  }

  const openStages = board.stages.filter((s) => s.kind === "open");
  const openCount = openStages.reduce((s, x) => s + x.count, 0);

  return (
    <div data-fullbleed className="relative flex h-full min-h-0 bg-background">
      {dialog}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <KanbanSquare className="h-4 w-4 text-subtle" />
            <h1 className="text-[15px] font-semibold tracking-tight text-foreground">Funil</h1>
            <span className="text-xs text-muted">{openCount} em andamento</span>
            {navPending ? <Spinner className="h-3.5 w-3.5" /> : null}
          </div>
          {clientSelect}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome, telefone, nota" className="h-8 w-56 rounded-md border border-border bg-surface-1 pl-8 pr-7 text-[13px] text-foreground placeholder:text-subtle focus:border-accent/60 focus:outline-none" />
              {search ? (
                <button type="button" onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-foreground" aria-label="Limpar busca">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <div className="flex rounded-md border border-border bg-surface-1 p-0.5 text-xs" role="group" aria-label="Filtro">
              {(
                [
                  ["", "Todos"],
                  ["aguardando", "Aguardando vocês"],
                  ["esfriando", "Sem resposta +3 dias"],
                ] as const
              ).map(([f, label]) => (
                <button key={f} type="button" onClick={() => go({ filter: f })} className={cn("rounded px-2.5 py-1 transition-colors", filters.filter === f ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground")}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex rounded-md border border-border bg-surface-1 p-0.5" role="group" aria-label="Visualização">
              <button type="button" onClick={() => go({ view: "quadro" })} title="Quadro" aria-label="Quadro" className={cn("rounded px-1.5 py-1", filters.view === "quadro" ? "bg-surface-3 text-foreground" : "text-subtle hover:text-foreground")}>
                <KanbanSquare className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => go({ view: "lista" })} title="Lista" aria-label="Lista" className={cn("rounded px-1.5 py-1", filters.view === "lista" ? "bg-surface-3 text-foreground" : "text-subtle hover:text-foreground")}>
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
            <button type="button" onClick={() => setEditing(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted hover:border-border-strong hover:text-foreground">
              <Settings2 className="h-3.5 w-3.5" /> Etapas
            </button>
          </div>
        </header>

        {filters.view === "quadro" ? (
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
            {board.stages.map((stage) => {
              const col = cards.filter((c) => c.stageId === stage.id);
              const isOver = overStage === stage.id && dragId !== null;
              return (
                <section
                  key={stage.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (overStage !== stage.id) setOverStage(stage.id);
                  }}
                  onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverStage(null);
                    // O id vem no próprio evento (mais confiável que o estado, que pode não ter atualizado ainda).
                    const id = e.dataTransfer.getData("text/x-lead") || dragId;
                    const card = cards.find((c) => c.id === id);
                    setDragId(null);
                    if (card) void moveCard(card, stage);
                  }}
                  className={cn("flex h-full w-[272px] shrink-0 flex-col rounded-lg border bg-surface-1 transition-colors", isOver ? "border-accent/60 bg-accent-soft" : "border-border")}
                >
                  <div className="flex items-baseline justify-between gap-2 px-3 pb-2 pt-2.5">
                    <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground">
                      {stage.kind === "won" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" /> : stage.kind === "lost" ? <XCircle className="h-3.5 w-3.5 shrink-0 text-subtle" /> : null}
                      <span className="truncate">{stage.name}</span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-subtle">
                      {stage.count}
                      {stage.valueLabel ? ` · ${stage.valueLabel}` : ""}
                    </span>
                  </div>
                  {stage.kind !== "open" ? <p className="-mt-1 px-3 pb-2 text-[10.5px] text-subtle">últimos 30 dias</p> : null}
                  <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
                    {col.map((c) => (
                      <LeadCard
                        key={c.id}
                        card={c}
                        active={lead?.id === c.id}
                        dragging={dragId === c.id}
                        onDragStart={() => setDragId(c.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverStage(null);
                        }}
                        onOpen={() => go({ lead: c.id })}
                      />
                    ))}
                    {col.length === 0 ? <p className="px-1 py-6 text-center text-[11.5px] text-subtle">{filters.search || filters.filter ? "Nada com esse filtro" : "Arraste um lead para cá"}</p> : null}
                    {stage.count > col.length && col.length >= board.perStage ? <p className="px-1 py-1 text-center text-[11px] text-subtle">Mostrando os {col.length} mais recentes · use a busca</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <LeadList stages={board.stages} cards={cards} activeId={lead?.id ?? null} onOpen={(id) => go({ lead: id })} onMove={moveCard} actions={actions} onChanged={refresh} />
        )}
      </div>

      {lead ? (
        <div className="absolute inset-0 z-20 flex justify-end bg-black/40 sm:static sm:z-auto sm:bg-transparent">
          <LeadDrawer
            key={lead.id}
            lead={lead}
            stages={board.stages}
            actions={actions}
            conversationHref={lead.conversationId ? `${conversationBase}${conversationBase.includes("?") ? "&" : "?"}c=${lead.conversationId}` : null}
            onClose={() => go({ lead: null })}
            onChanged={refresh}
          />
        </div>
      ) : null}

      {editing ? <StageEditor stages={board.stages} actions={actions} onClose={() => setEditing(false)} onSaved={refresh} /> : null}
    </div>
  );
}

function LeadCard({ card: c, active, dragging, onDragStart, onDragEnd, onOpen }: { card: LeadCardView; active: boolean; dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onOpen: () => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/x-lead", c.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "cursor-pointer rounded-md border bg-background px-3 py-2.5 text-xs transition-colors hover:border-border-strong",
        active ? "border-accent/60" : "border-border",
        dragging && "opacity-50",
        c.signal?.kind === "aguardando" && !active && "border-l-2 border-l-danger",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{c.name}</span>
        {c.value ? <span className="shrink-0 text-[11px] tabular-nums text-muted">{c.value}</span> : null}
      </div>
      {c.interest ? (
        <span title={c.interest.suggested ? "Sugerido pelo bot" : undefined} className={cn("mt-1 inline-block max-w-full truncate rounded bg-surface-2 px-1.5 text-[11px] leading-5 text-muted", c.interest.suggested && "italic")}>
          {c.interest.text}
        </span>
      ) : null}
      <div className="mt-1.5 space-y-1">
        {c.signal ? (
          <div className={cn("flex items-center gap-1.5 text-[11px]", c.signal.kind === "aguardando" ? "text-danger" : "text-warning")}>
            {c.signal.kind === "aguardando" ? <MessageCircle className="h-3 w-3 shrink-0" /> : <Clock className="h-3 w-3 shrink-0" />}
            <span className="truncate">{c.signal.label}</span>
          </div>
        ) : null}
        {c.appointment ? (
          <div className="flex items-center gap-1.5 text-[11px] text-foreground/85">
            <CalendarClock className="h-3 w-3 shrink-0 text-muted" /> {c.appointment}
          </div>
        ) : null}
        {c.nextAction ? (
          <div className={cn("flex items-center gap-1.5 text-[11px]", c.nextAction.overdue ? "text-danger" : "text-muted")}>
            <Flag className="h-3 w-3 shrink-0" /> <span className="truncate">{c.nextAction.label}</span>
          </div>
        ) : null}
        {c.lostReason ? <div className="truncate text-[11px] text-subtle">{c.lostReason}</div> : null}
        {!c.signal && !c.appointment && !c.nextAction && !c.lostReason ? <div className="text-[11px] text-subtle">na etapa {c.inStageSince}</div> : null}
      </div>
    </div>
  );
}

/** Visão em lista: todas as etapas numa tabela, com mover em lote. */
function LeadList({ stages, cards, activeId, onOpen, onMove, actions, onChanged }: { stages: StageView[]; cards: LeadCardView[]; activeId: string | null; onOpen: (id: string) => void; onMove: (card: LeadCardView, stage: StageView) => Promise<void>; actions: CrmActions; onChanged: () => void }) {
  const toast = useToast();
  const { ask, dialog } = useStageMove();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = React.useState(false);
  // Na ordem do funil.
  const sorted = stages.flatMap((s) => cards.filter((c) => c.stageId === s.id));

  async function bulkMove(stageId: string) {
    const to = stages.find((s) => s.id === stageId);
    if (!to || !selected.size) return;
    const extras = await ask(to, `${selected.size} lead${selected.size === 1 ? "" : "s"}`);
    if (!extras) return;
    setBulkBusy(true);
    let fails = 0;
    for (const id of selected) if ((await actions.move(id, to.id, extras)).error) fails++;
    setBulkBusy(false);
    if (fails) toast.error(`${fails} não puderam ser movidos.`);
    else toast.success(`Movidos para ${to.name}.`);
    setSelected(new Set());
    onChanged();
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {dialog}
      {selected.size ? (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-border bg-surface-1 px-3 py-2 text-xs">
          <span className="text-foreground">
            {selected.size} selecionado{selected.size === 1 ? "" : "s"}
          </span>
          <select value="" disabled={bulkBusy} onChange={(e) => void bulkMove(e.target.value)} className="h-7 rounded border border-border bg-background px-2 text-xs text-foreground">
            <option value="">Mover para…</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {bulkBusy ? <Spinner className="h-3.5 w-3.5" /> : null}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-muted hover:text-foreground">
            Limpar seleção
          </button>
        </div>
      ) : null}
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="border-b border-border text-[11px] uppercase tracking-wider text-subtle">
          <tr>
            <th className="w-8 py-2 pl-2">
              <input type="checkbox" aria-label="Selecionar todos" checked={selected.size > 0 && selected.size === sorted.length} onChange={(e) => setSelected(e.target.checked ? new Set(sorted.map((c) => c.id)) : new Set())} />
            </th>
            <th className="py-2 font-medium">Nome</th>
            <th className="py-2 font-medium">Etapa</th>
            <th className="py-2 font-medium">Interesse</th>
            <th className="py-2 font-medium">Situação</th>
            <th className="py-2 font-medium">Agenda / próxima ação</th>
            <th className="py-2 pr-2 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {sorted.map((c) => (
            <tr key={c.id} className={cn("cursor-pointer hover:bg-surface-1", activeId === c.id && "bg-surface-1")} onClick={() => onOpen(c.id)}>
              <td className="py-2 pl-2" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" aria-label={`Selecionar ${c.name}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              </td>
              <td className="py-2">
                <div className="text-[13px] text-foreground">{c.name}</div>
                <div className="text-[11px] text-subtle">{c.phone}</div>
              </td>
              <td className="py-2" onClick={(e) => e.stopPropagation()}>
                <select
                  value={c.stageId ?? ""}
                  onChange={(e) => {
                    const to = stages.find((s) => s.id === e.target.value);
                    if (to) void onMove(c, to);
                  }}
                  className="h-7 rounded border border-border bg-background px-1.5 text-xs text-foreground"
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className={cn("py-2 text-muted", c.interest?.suggested && "italic")}>{c.interest?.text ?? "—"}</td>
              <td className={cn("py-2", c.signal?.kind === "aguardando" ? "text-danger" : c.signal ? "text-warning" : "text-subtle")}>{c.signal?.label ?? `na etapa ${c.inStageSince}`}</td>
              <td className={cn("py-2", c.nextAction?.overdue ? "text-danger" : "text-muted")}>{c.appointment ?? c.nextAction?.label ?? "—"}</td>
              <td className="py-2 pr-2 text-right tabular-nums text-muted">{c.value ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 ? <p className="py-16 text-center text-sm text-muted">Nenhum lead aqui ainda. Quem mandar mensagem para o WhatsApp entra sozinho em &quot;Novo&quot;.</p> : null}
    </div>
  );
}

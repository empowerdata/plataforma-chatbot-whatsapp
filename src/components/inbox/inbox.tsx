"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Hand, MessagesSquare, Search, Smartphone, X } from "lucide-react";
import { Select, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { ContactPane } from "./contact-pane";
import { ConversationPane } from "./conversation-pane";
import { Avatar } from "./parts";
import { INBOX_VIEWS, type InboxActions, type InboxConversation, type InboxCounts, type InboxFilters, type InboxListItem, type InboxView } from "./types";

const POLL_MS = 5000;

const VIEW_SHORT: Record<InboxView, string> = { abertas: "Abertas", atencao: "Atenção", finalizadas: "Finalizadas", todas: "Todas" };

function hrefFor(basePath: string, f: InboxFilters, selectedId: string | null): string {
  const qs = new URLSearchParams();
  if (f.view !== "abertas") qs.set("v", f.view);
  if (f.category) qs.set("cat", f.category);
  if (f.numberId) qs.set("n", f.numberId);
  if (f.search) qs.set("q", f.search);
  if (selectedId) qs.set("c", selectedId);
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/**
 * Caixa de entrada em três colunas (lista · conversa · contato), a mesma
 * para a equipe do aluno e para o cliente final — só muda o escopo dos dados
 * (vem do servidor) e as ações recebidas. Atualiza sozinha a cada 5 s.
 */
export function Inbox({
  basePath,
  audience,
  list,
  counts,
  categories,
  numbers,
  filters,
  selectedId,
  selected,
  actions,
  emptyHint,
}: {
  basePath: string;
  audience: "staff" | "client";
  list: InboxListItem[];
  counts: InboxCounts;
  categories: string[];
  numbers: { id: string; label: string }[];
  filters: InboxFilters;
  selectedId: string | null;
  selected: InboxConversation | null;
  actions: InboxActions;
  emptyHint?: React.ReactNode;
}) {
  const router = useRouter();
  const [navPending, startNav] = React.useTransition();
  const [search, setSearch] = React.useState(filters.search);
  const [contactOpen, setContactOpen] = React.useState(false);

  const go = React.useCallback(
    (patch: Partial<InboxFilters>, id: string | null = selectedId) => {
      startNav(() => router.replace(hrefFor(basePath, { ...filters, ...patch }, id), { scroll: false }));
    },
    [router, basePath, filters, selectedId],
  );

  const refresh = React.useCallback(() => router.refresh(), [router]);

  React.useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [router]);

  React.useEffect(() => {
    if (search === filters.search) return;
    const t = setTimeout(() => go({ search }), 350);
    return () => clearTimeout(t);
  }, [search, filters.search, go]);

  React.useEffect(() => setContactOpen(false), [selectedId]);

  const multiNumber = numbers.length > 1;
  const filtered = !!(filters.category || filters.numberId || filters.search);

  return (
    <div data-fullbleed className="relative flex h-full min-h-0 overflow-hidden">
      {/* ------------------------------------------------ lista */}
      <aside className={cn("flex w-full min-h-0 flex-col border-r border-border bg-surface-1 md:w-[300px] md:shrink-0 2xl:w-[340px]", selectedId ? "hidden md:flex" : "flex")}>
        <div className="space-y-3 border-b border-border p-3">
          <div className="flex items-center justify-between px-0.5">
            <h1 className="text-sm font-semibold text-foreground">Conversas</h1>
            {navPending ? <Spinner className="h-3.5 w-3.5" /> : null}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, telefone ou mensagem"
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-7 text-sm text-foreground placeholder:text-subtle focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            {search ? (
              <button type="button" onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-foreground" aria-label="Limpar busca">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-4 gap-0.5 rounded-md border border-border bg-background p-0.5" role="tablist">
            {INBOX_VIEWS.map((v) => {
              const active = filters.view === v.id;
              const n = counts[v.id];
              return (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={v.label}
                  onClick={() => go({ view: v.id })}
                  className={cn("flex flex-col items-center rounded px-1 py-1 text-[11px] leading-tight transition-colors", active ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground")}
                >
                  <span className="truncate">{VIEW_SHORT[v.id]}</span>
                  <span className={cn("mt-0.5 font-semibold tabular-nums", v.id === "atencao" && n > 0 ? "text-warning" : active ? "text-foreground" : "text-subtle")}>{n}</span>
                </button>
              );
            })}
          </div>
          {categories.length || multiNumber ? (
            <div className="flex gap-2">
              {categories.length ? (
                <Select value={filters.category ?? ""} onChange={(e) => go({ category: e.target.value || null })} className="h-8 min-w-0 flex-1 text-xs" aria-label="Filtrar por categoria">
                  <option value="">Todas as categorias</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </Select>
              ) : null}
              {multiNumber ? (
                <Select value={filters.numberId ?? ""} onChange={(e) => go({ numberId: e.target.value || null })} className="h-8 min-w-0 flex-1 text-xs" aria-label="Filtrar por número">
                  <option value="">Todos os números</option>
                  {numbers.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          ) : null}
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <li className="px-6 py-14 text-center">
              {numbers.length === 0 ? (
                <>
                  <Smartphone className="mx-auto mb-2 h-5 w-5 text-subtle" />
                  <p className="text-sm text-muted">{emptyHint ?? "Nenhum número de WhatsApp ainda."}</p>
                </>
              ) : (
                <>
                  <MessagesSquare className="mx-auto mb-2 h-5 w-5 text-subtle" />
                  <p className="text-sm text-muted">{filtered ? "Nada encontrado com esses filtros." : filters.view === "atencao" ? "Ninguém esperando por você agora." : "Nenhuma conversa aqui ainda."}</p>
                  {filtered ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        go({ category: null, numberId: null, search: "" });
                      }}
                      className="mt-2 text-xs text-accent hover:underline"
                    >
                      Limpar filtros
                    </button>
                  ) : null}
                </>
              )}
            </li>
          ) : (
            list.map((item) => <ListRow key={item.id} item={item} active={item.id === selectedId} showNumber={multiNumber} onClick={() => go({}, item.id)} />)
          )}
        </ul>
      </aside>

      {/* ------------------------------------------------ conversa + contato */}
      {selected ? (
        <>
          <ConversationPane
            key={selected.id}
            conversation={selected}
            audience={audience}
            actions={actions}
            categories={categories}
            onBack={() => go({}, null)}
            onToggleContact={() => setContactOpen((v) => !v)}
            onChanged={refresh}
          />
          <ContactPane conversation={selected} audience={audience} actions={actions} onChanged={refresh} className="hidden 2xl:flex" />
          {contactOpen ? (
            <div className="absolute inset-0 z-20 flex justify-end bg-black/40 2xl:hidden" onClick={() => setContactOpen(false)}>
              <div onClick={(e) => e.stopPropagation()} className="flex h-full animate-scale-in shadow-2xl">
                <ContactPane conversation={selected} audience={audience} actions={actions} onChanged={refresh} onClose={() => setContactOpen(false)} />
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className={cn("min-w-0 flex-1 items-center justify-center bg-background", selectedId ? "flex" : "hidden md:flex")}>
          <div className="max-w-xs px-6 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-2">
              <MessagesSquare className="h-5 w-5 text-muted" />
            </div>
            <p className="text-sm font-medium text-foreground">{selectedId ? "Conversa não encontrada" : "Escolha uma conversa"}</p>
            <p className="mt-1 text-xs text-muted">{selectedId ? "Ela pode ter sido apagada pela limpeza automática de conversas antigas." : "As mensagens aparecem aqui e a lista se atualiza sozinha."}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ListRow({ item, active, showNumber, onClick }: { item: InboxListItem; active: boolean; showNumber: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={cn("relative flex w-full gap-3 border-b border-border/60 px-3 py-3 text-left transition-colors hover:bg-surface-2", active && "bg-surface-2")}>
        {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-accent" /> : null}
        <Avatar initials={item.initials} bot={item.bot} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-sm", item.needsHuman ? "font-semibold text-foreground" : "font-medium text-foreground")}>{item.title}</span>
            <span className={cn("shrink-0 text-[11px] tabular-nums", item.needsHuman ? "text-warning" : "text-subtle")}>{item.lastAt}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">{item.preview ?? "Sem mensagens ainda."}</div>
          {item.needsHuman || item.category || item.resolved || showNumber ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {item.needsHuman ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-soft px-1.5 text-[10px] font-medium leading-4 text-warning">
                  <Hand className="h-2.5 w-2.5" /> precisa de você
                </span>
              ) : null}
              {item.category ? <span className="rounded-full border border-border-strong bg-surface-2 px-1.5 text-[10px] leading-4 text-muted">{item.category}</span> : null}
              {item.resolved ? <span className="rounded-full border border-success/30 bg-success-soft px-1.5 text-[10px] leading-4 text-success">finalizada</span> : null}
              {showNumber ? <span className="truncate text-[10px] leading-4 text-subtle">{item.numberLabel}</span> : null}
            </div>
          ) : null}
        </div>
      </button>
    </li>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Inbox as InboxIcon, MessagesSquare, Search, Smartphone, X } from "lucide-react";
import { Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { ContactPane } from "./contact-pane";
import { ConversationPane } from "./conversation-pane";
import { Avatar, STATUS_META } from "./parts";
import { INBOX_PAGE, INBOX_VIEWS, type InboxActions, type InboxConversation, type InboxCounts, type InboxFilters, type InboxListItem } from "./types";

const POLL_MS = 5000;

function hrefFor(basePath: string, f: InboxFilters, selectedId: string | null): string {
  const qs = new URLSearchParams();
  if (f.view !== "abertas") qs.set("v", f.view);
  if (f.clientId) qs.set("cl", f.clientId);
  if (f.numberId) qs.set("n", f.numberId);
  if (f.category) qs.set("cat", f.category);
  if (f.search) qs.set("q", f.search);
  if (f.limit > INBOX_PAGE) qs.set("lim", String(f.limit));
  if (selectedId) qs.set("c", selectedId);
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/** Seletor compacto no estilo dos filtros da lista. */
function FilterSelect({ value, onChange, children, label }: { value: string; onChange: (v: string) => void; children: React.ReactNode; label: string }) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 min-w-0 flex-1 appearance-none truncate rounded-md border bg-background bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238b98a8%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_8px_center] bg-no-repeat py-0 pl-2.5 pr-6 text-xs transition-colors focus:border-accent/60 focus:outline-none",
        value ? "border-accent/40 text-foreground" : "border-border text-muted",
      )}
    >
      {children}
    </select>
  );
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
  clients,
  hasMore,
  noNumbers,
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
  clients: { id: string; name: string }[];
  hasMore: boolean;
  noNumbers: boolean;
  filters: InboxFilters;
  selectedId: string | null;
  selected: InboxConversation | null;
  actions: InboxActions;
  emptyHint?: React.ReactNode;
}) {
  const router = useRouter();
  const [navPending, startNav] = React.useTransition();
  const [search, setSearch] = React.useState(filters.search);
  // Ficha do contato (gaveta em telas menores): aberta para uma conversa específica, fecha sozinha ao trocar.
  const [contactFor, setContactFor] = React.useState<string | null>(null);
  const contactOpen = contactFor !== null && contactFor === selectedId;

  const go = React.useCallback(
    (patch: Partial<InboxFilters>, id: string | null = selectedId) => {
      // Mudou o filtro (não só a página ou a conversa)? Volta para a primeira página.
      const reset = Object.keys(patch).some((k) => k !== "limit") ? { limit: INBOX_PAGE } : {};
      startNav(() => router.replace(hrefFor(basePath, { ...filters, ...reset, ...patch }, id), { scroll: false }));
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

  const showClientFilter = audience === "staff" && clients.length > 1;
  const showNumberFilter = numbers.length > 1;
  const showClientOnRow = showClientFilter && !filters.clientId;
  const filtered = !!(filters.category || filters.numberId || filters.clientId || filters.search);

  return (
    <div data-fullbleed className="relative flex h-full min-h-0 overflow-hidden bg-background">
      {/* ------------------------------------------------ lista */}
      <aside className={cn("w-full min-h-0 flex-col border-r border-border bg-surface-1 md:w-[320px] md:shrink-0 2xl:w-[360px]", selectedId ? "hidden md:flex" : "flex")}>
        <div className="space-y-2.5 px-3 pb-2.5 pt-3">
          <div className="flex items-center gap-2 px-0.5">
            <InboxIcon className="h-4 w-4 text-subtle" />
            <h1 className="text-[15px] font-semibold tracking-tight text-foreground">Conversas</h1>
            {navPending ? <Spinner className="ml-auto h-3.5 w-3.5" /> : null}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou mensagem"
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-7 text-[13px] text-foreground placeholder:text-subtle focus:border-accent/60 focus:outline-none"
            />
            {search ? (
              <button type="button" onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-foreground" aria-label="Limpar busca">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {showClientFilter ? (
            <div className="flex">
              <FilterSelect label="Filtrar por cliente" value={filters.clientId ?? ""} onChange={(v) => go({ clientId: v || null, numberId: null, category: null })}>
                <option value="">Todos os clientes</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </FilterSelect>
            </div>
          ) : null}
          {showNumberFilter || categories.length ? (
            <div className="flex gap-2">
              {showNumberFilter ? (
                <FilterSelect label="Filtrar por número" value={filters.numberId ?? ""} onChange={(v) => go({ numberId: v || null })}>
                  <option value="">Todos os números</option>
                  {numbers.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </FilterSelect>
              ) : null}
              {categories.length ? (
                <FilterSelect label="Filtrar por categoria" value={filters.category ?? ""} onChange={(v) => go({ category: v || null })}>
                  <option value="">Todas as categorias</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </FilterSelect>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Contagem só onde pede ação (abertas, aguardando); as outras ficam no título e no rodapé da lista. */}
        <div className="flex border-b border-border px-1" role="tablist">
          {INBOX_VIEWS.map((v) => {
            const active = filters.view === v.id;
            const n = counts[v.id];
            const pill = (v.id === "abertas" || v.id === "atencao") && n > 0;
            const alert = v.id === "atencao" && n > 0;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={active}
                title={`${v.label}: ${n}`}
                onClick={() => go({ view: v.id })}
                className={cn("relative flex flex-auto items-center justify-center gap-1.5 whitespace-nowrap px-1.5 py-2 text-xs font-medium transition-colors", active ? "text-foreground" : "text-muted hover:text-foreground")}
              >
                {v.short}
                {pill ? <span className={cn("rounded-full px-1.5 text-[10px] leading-4 tabular-nums", alert ? "bg-warning-soft text-warning" : active ? "bg-surface-3 text-foreground" : "bg-surface-2 text-subtle")}>{n}</span> : null}
                {active ? <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
              </button>
            );
          })}
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <li className="px-6 py-16 text-center">
              {noNumbers ? (
                <>
                  <Smartphone className="mx-auto mb-2 h-5 w-5 text-subtle" />
                  <p className="text-[13px] text-muted">{emptyHint ?? "Nenhum número de WhatsApp ainda."}</p>
                </>
              ) : (
                <>
                  <MessagesSquare className="mx-auto mb-2 h-5 w-5 text-subtle" />
                  <p className="text-[13px] text-muted">{filtered ? "Nada encontrado com esses filtros." : filters.view === "atencao" ? "Ninguém aguardando você agora." : "Nenhuma conversa aqui ainda."}</p>
                  {filtered ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        go({ category: null, numberId: null, clientId: null, search: "" });
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
            list.map((item) => <ListRow key={item.id} item={item} active={item.id === selectedId} showClient={showClientOnRow} showNumber={showNumberFilter && !filters.numberId} onClick={() => go({}, item.id)} />)
          )}
          {hasMore ? (
            <li className="px-3 py-3">
              <button type="button" onClick={() => go({ limit: filters.limit + INBOX_PAGE })} className="w-full rounded-md border border-border py-1.5 text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground">
                Carregar mais conversas
              </button>
              {/* O total da aba só vale sem busca/categoria (as contagens ignoram esses dois filtros). */}
              {!filters.search && !filters.category ? (
                <p className="mt-1.5 text-center text-[11px] tabular-nums text-subtle">
                  Mostrando {list.length} de {counts[filters.view]}
                </p>
              ) : null}
            </li>
          ) : null}
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
            onToggleContact={() => setContactFor(contactOpen ? null : selectedId)}
            onChanged={refresh}
          />
          <ContactPane conversation={selected} audience={audience} actions={actions} onChanged={refresh} className="hidden 2xl:flex" />
          {contactOpen ? (
            <div className="absolute inset-0 z-20 flex justify-end bg-black/40 2xl:hidden" onClick={() => setContactFor(null)}>
              <div onClick={(e) => e.stopPropagation()} className="flex h-full animate-scale-in shadow-2xl">
                <ContactPane conversation={selected} audience={audience} actions={actions} onChanged={refresh} onClose={() => setContactFor(null)} />
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className={cn("min-w-0 flex-1 items-center justify-center", selectedId ? "flex" : "hidden md:flex")}>
          <div className="max-w-xs px-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2">
              <MessagesSquare className="h-[18px] w-[18px] text-subtle" />
            </div>
            <p className="text-[13px] font-medium text-foreground">{selectedId ? "Conversa não encontrada" : "Escolha uma conversa"}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{selectedId ? "Ela pode ter sido apagada pela limpeza automática de conversas antigas." : "As mensagens aparecem aqui e a lista se atualiza sozinha."}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ListRow({ item, active, showClient, showNumber, onClick }: { item: InboxListItem; active: boolean; showClient: boolean; showNumber: boolean; onClick: () => void }) {
  const waiting = item.status === "aguardando";
  const origin = showClient ? item.clientName ?? item.numberLabel : showNumber ? item.numberLabel : null;
  // Sempre duas linhas (altura fixa): com centenas de conversas, a lista precisa ser escaneável.
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        title={STATUS_META[item.status].label}
        className={cn("relative flex w-full items-center gap-2.5 border-b border-border/50 px-3 py-2.5 text-left transition-colors", active ? "bg-surface-2" : "hover:bg-surface-2/60")}
      >
        {active || waiting ? <span className={cn("absolute inset-y-0 left-0 w-0.5", active ? "bg-accent" : "bg-warning")} /> : null}
        <Avatar initials={item.initials} status={item.status} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn("min-w-0 truncate text-[13px] text-foreground", waiting ? "font-semibold" : "font-medium")}>{item.title}</span>
            {origin ? <span className="min-w-0 max-w-[45%] shrink-[2] truncate text-[11px] text-subtle">{origin}</span> : null}
            <span className={cn("ml-auto shrink-0 text-[11px] tabular-nums", waiting ? "font-medium text-warning" : "text-subtle")}>{item.lastAt}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p className={cn("min-w-0 flex-1 truncate text-xs", item.status === "finalizada" ? "text-subtle" : "text-muted")}>{item.preview ?? "Sem mensagens ainda."}</p>
            {item.category ? <span className="max-w-[40%] shrink-0 truncate rounded bg-surface-3/70 px-1.5 text-[10.5px] leading-4 text-muted">{item.category}</span> : null}
          </div>
        </div>
      </button>
    </li>
  );
}

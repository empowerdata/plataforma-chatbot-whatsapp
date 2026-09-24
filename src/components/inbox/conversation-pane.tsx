"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Bell, Bot, Check, CheckCircle2, ChevronDown, Hand, PanelRight, Plus, RotateCcw, SendHorizontal, Tag, User, X } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { useDialogs } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Avatar, MenuItem, Popover, botDot, botExplanation, botLabel } from "./parts";
import type { ActionResult, BotState, InboxActions, InboxConversation, InboxThreadItem } from "./types";

type Audience = "staff" | "client";

export function ConversationPane({
  conversation: c,
  audience,
  actions,
  categories,
  onBack,
  onToggleContact,
  onChanged,
}: {
  conversation: InboxConversation;
  audience: Audience;
  actions: InboxActions;
  categories: string[];
  onBack: () => void;
  onToggleContact: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const run = React.useCallback(
    async (key: string, fn: () => Promise<ActionResult>, ok?: string) => {
      setBusy(key);
      try {
        const res = await fn();
        if (res.error) toast.error(res.error);
        else {
          if (ok) toast.success(ok);
          onChanged();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [toast, onChanged],
  );

  const setBot = (enabled: boolean) => run("bot", () => actions.setBot(c.id, enabled), enabled ? "Bot ligado nesta conversa." : "Bot desligado nesta conversa.");
  const toggleResolved = () => run("resolved", () => actions.setResolved(c.id, !c.resolved), c.resolved ? "Conversa reaberta." : "Conversa finalizada.");

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-surface-1 px-3 py-2.5 sm:px-4">
        <button type="button" onClick={onBack} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground md:hidden" aria-label="Voltar para a lista">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar initials={c.initials} bot={botDot(c.bot)} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">{c.title}</h2>
          <div className="truncate text-xs text-muted">
            {c.phone} · {c.numberLabel}
          </div>
        </div>
        <BotSwitch state={c.bot} audience={audience} busy={busy === "bot"} onChange={setBot} />
        <Button size="sm" variant={c.resolved ? "outline" : "secondary"} loading={busy === "resolved"} onClick={toggleResolved} title={c.resolved ? "Reabrir conversa" : "Marcar como finalizada"}>
          {busy === "resolved" ? null : c.resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{c.resolved ? "Reabrir" : "Finalizar"}</span>
        </Button>
        <button type="button" onClick={onToggleContact} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground 2xl:hidden" aria-label="Ver contato">
          <PanelRight className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-1 px-3 py-2 sm:px-4">
        {c.resolved ? (
          <Badge tone="success">
            <CheckCircle2 className="h-3 w-3" /> Finalizada
          </Badge>
        ) : null}
        <CategoryMenu category={c.category} categories={categories} busy={busy === "category"} onChange={(value) => run("category", () => actions.setCategory(c.id, value), value ? "Categoria atualizada." : "Categoria removida.")} />
        {c.needsHuman ? (
          <Badge tone="warning">
            <Hand className="h-3 w-3" /> Precisa de você
          </Badge>
        ) : null}
        {c.needsHuman && c.handoffReason ? <span className="truncate text-xs text-muted">“{c.handoffReason}”</span> : null}
      </div>

      <BotBanner conversation={c} audience={audience} busy={busy} onResume={() => setBot(true)} onUnblock={() => run("block", () => actions.setBlocked(c.id, false), "Contato desbloqueado.")} />

      <Thread conversation={c} actions={actions} onChanged={onChanged} />
    </section>
  );
}

// ------------------------------------------------------------ bot

function BotSwitch({ state, audience, busy, onChange }: { state: BotState; audience: Audience; busy: boolean; onChange: (enabled: boolean) => void }) {
  const on = state.kind === "active";
  const locked = state.kind === "blocked" || state.kind === "number_off" || state.kind === "no_bot";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={locked || busy}
      onClick={() => onChange(!on)}
      title={botExplanation(state, audience)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        on ? "border-success/30 bg-success-soft text-success hover:bg-success/20" : state.kind === "paused" ? "border-warning/30 bg-warning-soft text-warning hover:bg-warning/20" : "border-border-strong bg-surface-2 text-muted hover:text-foreground",
      )}
    >
      <span className={cn("relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors", on ? "bg-success" : "border border-border-strong bg-surface-3")}>
        <span className={cn("absolute h-3 w-3 rounded-full bg-white shadow transition-transform duration-200", on ? "translate-x-3.5" : "translate-x-0.5")} />
      </span>
      <span className="hidden sm:inline">{botLabel(state)}</span>
    </button>
  );
}

function BotBanner({ conversation: c, audience, busy, onResume, onUnblock }: { conversation: InboxConversation; audience: Audience; busy: string | null; onResume: () => void; onUnblock: () => void }) {
  const s = c.bot;
  if (s.kind === "active") return null;
  const warn = s.kind === "paused";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2 text-xs sm:px-4", warn ? "border-warning/20 bg-warning-soft text-foreground/90" : "border-border bg-surface-2 text-muted")}>
      <Bot className={cn("h-3.5 w-3.5 shrink-0", warn ? "text-warning" : "text-subtle")} />
      <span className="min-w-0 flex-1">{botExplanation(s, audience)}</span>
      {s.kind === "paused" || s.kind === "off" ? (
        <Button size="sm" variant="outline" loading={busy === "bot"} onClick={onResume} className="h-7">
          {s.kind === "paused" ? "Reativar agora" : "Ligar o bot"}
        </Button>
      ) : null}
      {s.kind === "blocked" ? (
        <Button size="sm" variant="outline" loading={busy === "block"} onClick={onUnblock} className="h-7">
          Desbloquear
        </Button>
      ) : null}
      {audience === "staff" && (s.kind === "number_off" || s.kind === "no_bot") ? (
        <Link href={`/numeros/${c.numberId}`} className="font-medium text-accent hover:underline">
          Abrir o número
        </Link>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------ categoria

function CategoryMenu({ category, categories, busy, onChange }: { category: string | null; categories: string[]; busy: boolean; onChange: (value: string | null) => void }) {
  const { promptDialog } = useDialogs();
  const options = category && !categories.includes(category) ? [category, ...categories] : categories;
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors disabled:opacity-60",
            category ? "border-border-strong bg-surface-2 text-foreground" : "border-dashed border-border-strong text-muted hover:text-foreground",
            open && "border-accent/50",
          )}
        >
          <Tag className="h-3 w-3" />
          {category ?? "Categorizar"}
          <ChevronDown className="h-3 w-3 text-subtle" />
        </button>
      )}
    >
      {(close) => (
        <div className="max-h-72 overflow-y-auto">
          {options.length ? (
            options.map((opt) => (
              <MenuItem
                key={opt}
                active={opt === category}
                onClick={() => {
                  close();
                  if (opt !== category) onChange(opt);
                }}
              >
                <span className="flex-1 truncate">{opt}</span>
                {opt === category ? <Check className="h-3.5 w-3.5" /> : null}
              </MenuItem>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-muted">Nenhuma categoria usada ainda.</p>
          )}
          <div className="my-1 h-px bg-border" />
          <MenuItem
            onClick={async () => {
              close();
              const value = await promptDialog("Nome da categoria:", "", { title: "Nova categoria", placeholder: "ex.: Orçamento, Agendamento, Reclamação…", confirmLabel: "Aplicar" });
              if (value && value.trim()) onChange(value.trim());
            }}
          >
            <Plus className="h-3.5 w-3.5 text-muted" /> Nova categoria…
          </MenuItem>
          {category ? (
            <MenuItem
              tone="danger"
              onClick={() => {
                close();
                onChange(null);
              }}
            >
              <X className="h-3.5 w-3.5" /> Remover categoria
            </MenuItem>
          ) : null}
        </div>
      )}
    </Popover>
  );
}

// ------------------------------------------------------------ conversa + composer

type Pending = { key: string; text: string };

function Thread({ conversation: c, actions, onChanged }: { conversation: InboxConversation; actions: InboxActions; onChanged: () => void }) {
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState<Pending[]>([]);
  const [sending, setSending] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const atBottom = React.useRef(true);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // A mensagem otimista some assim que a versão de verdade chega na próxima atualização.
  React.useEffect(() => {
    if (!pending.length) return;
    const sent = new Set(
      c.thread
        .slice(-20)
        .filter((i): i is Extract<InboxThreadItem, { kind: "message" }> => i.kind === "message" && i.sender === "human")
        .map((i) => i.body),
    );
    setPending((p) => p.filter((m) => !sent.has(m.text)));
  }, [c.thread, pending.length]);

  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [c.thread.length, pending.length]);

  const canSend = c.numberConnected && !c.contact.isBlocked;

  async function send() {
    const body = text.trim();
    if (!body || sending || !canSend) return;
    const key = `p-${Date.now()}`;
    setPending((p) => [...p, { key, text: body }]);
    setText("");
    atBottom.current = true;
    if (inputRef.current) inputRef.current.style.height = "auto";
    setSending(true);
    try {
      const res = await actions.send(c.id, body);
      if (res.error) {
        toast.error(res.error);
        setPending((p) => p.filter((m) => m.key !== key));
        setText(body);
      } else {
        onChanged();
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  let prevSender: string | null = null;

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,rgba(230,237,243,0.035)_1px,transparent_0)] bg-[length:18px_18px] px-3 py-4 sm:px-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col">
          {c.thread.length === 0 && !pending.length ? <p className="py-16 text-center text-sm text-muted">Nenhuma mensagem nesta conversa ainda.</p> : null}
          {c.thread.map((item) => {
            if (item.kind === "day") {
              prevSender = null;
              return (
                <div key={item.id} className="flex justify-center py-3">
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted">{item.label}</span>
                </div>
              );
            }
            if (item.kind === "event") {
              prevSender = null;
              return (
                <div key={item.id} className="flex justify-center py-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/25 bg-warning-soft px-3 py-1 text-[11px] text-warning">
                    <Bell className="h-3 w-3" /> {item.text}
                  </span>
                </div>
              );
            }
            const grouped = prevSender === item.sender;
            prevSender = item.sender;
            return <Bubble key={item.id} item={item} grouped={grouped} />;
          })}
          {pending.map((p) => (
            <div key={p.key} className="mt-2 flex justify-end">
              <div className="max-w-[78%] rounded-2xl rounded-br-md bg-wa-out/60 px-3 py-2 text-sm text-white/80">
                <div className="whitespace-pre-wrap break-words">{p.text}</div>
                <div className="mt-1 text-right text-[10px] text-white/50">enviando…</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border bg-surface-1 px-3 py-3 sm:px-4">
        {!c.numberConnected ? <p className="mx-auto mb-2 max-w-3xl text-xs text-warning">O WhatsApp deste número está desconectado — reconecte para voltar a enviar mensagens.</p> : null}
        <form
          className="mx-auto flex max-w-3xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="flex-1 rounded-xl border border-border bg-background px-3 py-2 transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              disabled={!canSend}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={c.contact.isBlocked ? "Contato bloqueado" : c.numberConnected ? "Escreva uma mensagem…" : "WhatsApp desconectado"}
              className="block max-h-40 w-full resize-none bg-transparent text-sm leading-6 text-foreground placeholder:text-subtle focus:outline-none disabled:cursor-not-allowed"
            />
          </div>
          <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-xl" disabled={!text.trim() || !canSend} loading={sending} aria-label="Enviar">
            {sending ? null : <SendHorizontal className="h-4 w-4" />}
          </Button>
        </form>
        <p className="mx-auto mt-1.5 max-w-3xl text-[11px] text-subtle">
          Enter envia · Shift+Enter quebra linha
          {c.bot.kind === "active" && c.pauseHoursOnReply > 0 ? ` · ao responder, o bot pausa nesta conversa por ${c.pauseHoursOnReply}h` : ""}
        </p>
      </div>
    </>
  );
}

function Bubble({ item, grouped }: { item: Extract<InboxThreadItem, { kind: "message" }>; grouped: boolean }) {
  const mine = item.sender !== "contact";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-2.5")}>
      <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm", mine ? "bg-wa-out text-white" : "bg-wa-in text-foreground", !grouped && (mine ? "rounded-br-md" : "rounded-bl-md"))}>
        {!grouped && item.sender === "bot" ? (
          <div className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/65">
            <Bot className="h-3 w-3" /> Bot
          </div>
        ) : null}
        {!grouped && item.sender === "human" ? (
          <div className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/65">
            <User className="h-3 w-3" /> {item.author}
          </div>
        ) : null}
        <div className="whitespace-pre-wrap break-words">{item.body}</div>
        <div className={cn("mt-1 text-right text-[10px]", mine ? "text-white/55" : "text-muted")}>
          {item.offHours ? "fora do horário · " : ""}
          {item.time}
        </div>
        {item.meta ? <div className="mt-1 border-t border-white/10 pt-1 text-[10px] text-white/45">{item.meta}</div> : null}
      </div>
    </div>
  );
}

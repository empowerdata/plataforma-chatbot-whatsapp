"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Bell, Bot, Check, CheckCircle2, ChevronDown, Copy, FileText, Mic, MoreHorizontal, PanelRight, Paperclip, Plus, RotateCcw, SendHorizontal, ShieldCheck, Square, Tag, Trash2, User, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useDialogs } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Avatar, MenuItem, MenuLabel, MenuSeparator, Popover, StatusLabel, botExplanation, botLabel } from "./parts";
import { MEDIA_MAX_BYTES, type ActionResult, type BotState, type InboxActions, type InboxConversation, type InboxThreadItem } from "./types";
import { MediaView, formatBytes, formatDuration, useVoiceRecorder } from "./media";

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
  const { confirmDialog } = useDialogs();
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
  const setBlocked = async (blocked: boolean) => {
    if (blocked) {
      const ok = await confirmDialog("O bot deixa de responder este contato e nenhuma automação roda para ele. Dá para desbloquear quando quiser.", { title: "Bloquear este contato?", destructive: true, confirmLabel: "Bloquear" });
      if (!ok) return;
    }
    void run("block", () => actions.setBlocked(c.id, blocked), blocked ? "Contato bloqueado." : "Contato desbloqueado.");
  };
  const origin = c.clientName && audience === "staff" ? `${c.clientName} · ${c.numberLabel}` : c.numberLabel;
  const categoryMenu = (
    <CategoryMenu category={c.category} categories={categories} busy={busy === "category"} onChange={(value) => run("category", () => actions.setCategory(c.id, value), value ? "Categoria atualizada." : "Categoria removida.")} />
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-border bg-surface-1 px-3 sm:px-4">
        <button type="button" onClick={onBack} className="-ml-1 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground md:hidden" aria-label="Voltar para a lista">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar initials={c.initials} status={c.status} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{c.title}</h2>
            <div className="hidden shrink-0 sm:block">{categoryMenu}</div>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted">
            <StatusLabel status={c.status} className="shrink-0" />
            <span className="hidden text-subtle sm:inline">·</span>
            <span className="hidden truncate sm:inline">
              {c.phone} · {origin}
            </span>
          </div>
        </div>
        <BotSwitch state={c.bot} audience={audience} busy={busy === "bot"} onChange={setBot} />
        <Button size="sm" variant={c.resolved ? "outline" : "secondary"} loading={busy === "resolved"} onClick={toggleResolved} className="h-8" title={c.resolved ? "Reabrir conversa" : "Marcar como finalizada"}>
          {busy === "resolved" ? null : c.resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{c.resolved ? "Reabrir" : "Finalizar"}</span>
        </Button>
        <Popover
          align="end"
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Mais ações">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                onClick={() => {
                  close();
                  onToggleContact();
                }}
              >
                <PanelRight className="h-3.5 w-3.5 text-muted" /> Ficha do contato
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  void navigator.clipboard.writeText(c.phone.replace(/\D/g, "")).then(() => toast.success("Telefone copiado."));
                }}
              >
                <Copy className="h-3.5 w-3.5 text-muted" /> Copiar telefone
              </MenuItem>
              <MenuSeparator />
              {c.contact.isBlocked ? (
                <MenuItem
                  onClick={() => {
                    close();
                    void setBlocked(false);
                  }}
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-muted" /> Desbloquear contato
                </MenuItem>
              ) : (
                <MenuItem
                  tone="danger"
                  onClick={() => {
                    close();
                    void setBlocked(true);
                  }}
                >
                  <Ban className="h-3.5 w-3.5" /> Bloquear contato
                </MenuItem>
              )}
            </>
          )}
        </Popover>
      </header>

      {/* No celular o cabeçalho só cabe nome e situação; categoria e telefone descem para esta faixa. */}
      <div className="flex min-w-0 items-center gap-2 border-b border-border bg-surface-1 px-3 py-1.5 text-[11.5px] text-muted sm:hidden">
        {categoryMenu}
        <span className="truncate">{c.phone}</span>
      </div>

      <BotNotice conversation={c} audience={audience} busy={busy} onResume={() => setBot(true)} onUnblock={() => void setBlocked(false)} />

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
      aria-label={botLabel(state)}
      disabled={locked || busy}
      onClick={() => onChange(!on)}
      title={`${botLabel(state)}. ${botExplanation(state, audience)}`}
      className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-border px-2.5 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Bot className={cn("h-3.5 w-3.5", on ? "text-success" : state.kind === "paused" ? "text-warning" : "text-subtle")} />
      <span className="hidden lg:inline">Bot</span>
      <span className={cn("relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors", on ? "bg-success" : "bg-surface-3 ring-1 ring-inset ring-border-strong")}>
        <span className={cn("absolute h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200", on ? "translate-x-3.5" : "translate-x-0.5")} />
      </span>
    </button>
  );
}

/** Aviso fino, só quando o bot não está respondendo — sempre com o motivo e o que fazer. */
function BotNotice({ conversation: c, audience, busy, onResume, onUnblock }: { conversation: InboxConversation; audience: Audience; busy: string | null; onResume: () => void; onUnblock: () => void }) {
  const s = c.bot;
  if (s.kind === "active") return null;
  const waiting = c.status === "aguardando";
  const text = waiting && c.handoffReason ? `${botExplanation(s, audience)} Motivo: “${c.handoffReason}”.` : botExplanation(s, audience);
  return (
    <div className={cn("flex shrink-0 items-center gap-3 border-b px-4 py-2 text-xs", waiting ? "border-warning/20 bg-warning-soft/70" : "border-border bg-surface-1/60")}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", waiting || s.kind === "paused" ? "bg-warning" : "bg-subtle")} />
      <span className="min-w-0 flex-1 leading-relaxed text-foreground/80">{text}</span>
      {s.kind === "paused" || s.kind === "off" ? (
        <button type="button" disabled={busy === "bot"} onClick={onResume} className="shrink-0 font-medium text-accent hover:underline disabled:opacity-50">
          {s.kind === "paused" ? "Devolver ao bot" : "Ligar o bot"}
        </button>
      ) : null}
      {s.kind === "blocked" ? (
        <button type="button" disabled={busy === "block"} onClick={onUnblock} className="shrink-0 font-medium text-accent hover:underline disabled:opacity-50">
          Desbloquear
        </button>
      ) : null}
      {audience === "staff" && (s.kind === "number_off" || s.kind === "no_bot") ? (
        <Link href={`/numeros/${c.numberId}`} className="shrink-0 font-medium text-accent hover:underline">
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
            "inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors disabled:opacity-60",
            category ? "bg-surface-3/80 text-foreground/80 hover:text-foreground" : "text-subtle hover:bg-surface-2 hover:text-foreground",
            open && "bg-surface-3 text-foreground",
          )}
        >
          <Tag className="h-3 w-3" />
          {category ?? "Categorizar"}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      )}
    >
      {(close) => (
        <div className="max-h-72 overflow-y-auto">
          <MenuLabel>Categoria</MenuLabel>
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
                {opt === category ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
              </MenuItem>
            ))
          ) : (
            <p className="px-2.5 py-1.5 text-xs text-muted">Nenhuma categoria usada ainda.</p>
          )}
          <MenuSeparator />
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
              onClick={() => {
                close();
                onChange(null);
              }}
            >
              <X className="h-3.5 w-3.5 text-muted" /> Remover categoria
            </MenuItem>
          ) : null}
        </div>
      )}
    </Popover>
  );
}

// ------------------------------------------------------------ conversa + composer

/** Mensagem otimista enquanto o envio não volta. As de mídia somem ao fim do envio; as de texto, quando a de verdade aparece. */
type Pending = { key: string; text: string; media?: boolean };
type Attachment = { file: File; preview: string | null };
type MessageItem = Extract<InboxThreadItem, { kind: "message" }>;

function Thread({ conversation: c, actions, onChanged }: { conversation: InboxConversation; actions: InboxActions; onChanged: () => void }) {
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState<Pending[]>([]);
  const [sending, setSending] = React.useState(false);
  const [attachment, setAttachment] = React.useState<Attachment | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const atBottom = React.useRef(true);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const onRecorderError = React.useCallback((message: string) => toast.error(message), [toast]);
  const recorder = useVoiceRecorder(onRecorderError);

  // A mensagem otimista de texto some assim que a versão de verdade chega na próxima atualização.
  const shownPending = React.useMemo(() => {
    if (!pending.length) return pending;
    const sent = new Set(
      c.thread
        .slice(-20)
        .filter((i): i is MessageItem => i.kind === "message" && i.sender === "human")
        .map((i) => i.body),
    );
    return pending.filter((m) => m.media || !sent.has(m.text));
  }, [c.thread, pending]);

  // Rótulo de quem falou só no começo de cada sequência (separador de dia ou aviso reinicia).
  const groupStarts = React.useMemo(() => {
    const starts = new Set<string>();
    let prev: string | null = null;
    for (const item of c.thread) {
      if (item.kind !== "message") {
        prev = null;
        continue;
      }
      const k = `${item.sender}:${item.author ?? ""}`;
      if (k !== prev) starts.add(item.id);
      prev = k;
    }
    return starts;
  }, [c.thread]);

  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [c.thread.length, shownPending.length]);

  const canSend = c.numberConnected && !c.contact.isBlocked;

  function pickFile(file: File) {
    if (file.size > MEDIA_MAX_BYTES) {
      toast.error("Arquivo grande demais: o limite é 16 MB.");
      return;
    }
    if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    setAttachment({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null });
    inputRef.current?.focus();
  }

  function clearAttachment() {
    if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    setAttachment(null);
  }

  /** Envia arquivo ou áudio pela rota de mídia (server action limita o corpo a 1 MB). */
  async function upload(file: Blob, name: string, caption: string | undefined, label: string): Promise<boolean> {
    const key = `m-${Date.now()}`;
    setPending((p) => [...p, { key, text: label, media: true }]);
    atBottom.current = true;
    setSending(true);
    try {
      const form = new FormData();
      form.append("conversationId", c.id);
      form.append("file", file, name);
      if (caption) form.append("caption", caption);
      const res = await fetch("/api/inbox/send-media", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as { error: string | null } | null;
      if (!res.ok || json?.error) {
        toast.error(json?.error ?? "Não foi possível enviar o arquivo.");
        return false;
      }
      onChanged();
      return true;
    } catch {
      toast.error("Falha de conexão ao enviar o arquivo. Tente de novo.");
      return false;
    } finally {
      setPending((p) => p.filter((m) => m.key !== key));
      setSending(false);
    }
  }

  async function sendVoice() {
    const rec = recorder.recording;
    if (!rec || sending || !canSend) return;
    const ext = rec.blob.type.includes("ogg") ? "ogg" : rec.blob.type.includes("mp4") ? "m4a" : "webm";
    if (await upload(rec.blob, `audio.${ext}`, undefined, `🎤 Áudio (${formatDuration(rec.seconds)})`)) recorder.discard();
  }

  async function send() {
    if (attachment) {
      if (sending || !canSend) return;
      const caption = text.trim();
      if (await upload(attachment.file, attachment.file.name, caption || undefined, `📎 ${attachment.file.name}`)) {
        clearAttachment();
        setText("");
        if (inputRef.current) inputRef.current.style.height = "auto";
      }
      return;
    }
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

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-8"
      >
        <div className="mx-auto flex max-w-3xl flex-col">
          {c.thread.length === 0 && !shownPending.length ? <p className="py-16 text-center text-[13px] text-muted">Nenhuma mensagem nesta conversa ainda.</p> : null}
          {c.thread.map((item) => {
            if (item.kind === "day") {
              return (
                <div key={item.id} className="flex items-center gap-3 py-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium text-subtle">{item.label}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              );
            }
            if (item.kind === "event") {
              return (
                <div key={item.id} className="flex justify-center py-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                    <Bell className="h-3 w-3 text-warning" /> {item.text}
                  </span>
                </div>
              );
            }
            return <Bubble key={item.id} item={item} first={groupStarts.has(item.id)} />;
          })}
          {shownPending.map((p) => (
            <div key={p.key} className="mt-0.5 flex justify-end">
              <div className="max-w-[min(34rem,78%)] rounded-xl bg-bubble-team/60 px-3 py-1.5 text-[13.5px] leading-[1.45] text-foreground/70">
                <span className="whitespace-pre-wrap break-words">{p.text}</span>
                <span className="ml-2 text-[10px] text-subtle">enviando…</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-surface-1 px-3 pb-3 pt-2.5 sm:px-4">
        {!c.numberConnected ? <p className="mx-auto mb-2 max-w-3xl text-xs text-warning">O WhatsApp deste número está desconectado — reconecte para voltar a enviar mensagens.</p> : null}
        {attachment ? (
          <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2.5 rounded-lg border border-border bg-background px-2.5 py-2">
            {attachment.preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:)
              <img src={attachment.preview} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-2">
                <FileText className="h-5 w-5 text-muted" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-foreground">{attachment.file.name}</div>
              <div className="text-[11px] text-subtle">
                {formatBytes(attachment.file.size)}
                {attachment.file.type.startsWith("audio/") ? " · vai como mensagem de voz" : ""}
              </div>
            </div>
            <button type="button" onClick={clearAttachment} aria-label="Remover anexo" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {recorder.state !== "idle" ? (
          <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-xl border border-border bg-background py-1.5 pl-1.5 pr-1.5">
            <button type="button" onClick={recorder.discard} aria-label="Descartar áudio" title="Descartar" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger">
              <Trash2 className="h-4 w-4" />
            </button>
            {recorder.state === "recording" ? (
              <>
                <span className="inline-flex flex-1 items-center gap-2 text-[13px] text-foreground">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
                  Gravando <span className="tabular-nums text-muted">{formatDuration(recorder.seconds)}</span>
                </span>
                <button type="button" onClick={recorder.stop} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-surface-3 px-3 text-xs font-medium text-foreground hover:bg-surface-2">
                  <Square className="h-3 w-3 fill-current" /> Parar
                </button>
              </>
            ) : recorder.recording ? (
              <>
                <audio src={recorder.recording.url} controls className="h-9 min-w-0 flex-1 [color-scheme:dark]" />
                <button
                  type="button"
                  onClick={() => void sendVoice()}
                  disabled={sending || !canSend}
                  aria-label="Enviar áudio"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors hover:bg-accent-strong disabled:bg-surface-3 disabled:text-subtle"
                >
                  <SendHorizontal className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <form
            className="mx-auto flex max-w-3xl items-end gap-1 rounded-xl border border-border bg-background py-1.5 pl-1.5 pr-1.5 transition-colors focus-within:border-accent/50"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!canSend} aria-label="Anexar arquivo" title="Anexar foto, vídeo ou documento (até 16 MB)" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40">
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
                e.target.value = "";
              }}
            />
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
              onPaste={(e) => {
                // Colar um print (Ctrl+V) vira anexo.
                const f = e.clipboardData.files?.[0];
                if (f) {
                  e.preventDefault();
                  pickFile(f);
                }
              }}
              placeholder={c.contact.isBlocked ? "Contato bloqueado" : !c.numberConnected ? "WhatsApp desconectado" : attachment ? "Legenda (opcional)…" : "Escreva uma mensagem…"}
              className="my-1 ml-1 block max-h-40 min-w-0 flex-1 resize-none bg-transparent text-[13.5px] leading-6 text-foreground placeholder:text-subtle focus:outline-none disabled:cursor-not-allowed"
            />
            {text.trim() || attachment ? (
              <button
                type="submit"
                disabled={!canSend || sending}
                aria-label="Enviar"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors hover:bg-accent-strong disabled:bg-surface-3 disabled:text-subtle"
              >
                <SendHorizontal className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={() => void recorder.start()} disabled={!canSend} aria-label="Gravar áudio" title="Gravar áudio" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40">
                <Mic className="h-4 w-4" />
              </button>
            )}
          </form>
        )}
        <p className="mx-auto mt-1.5 max-w-3xl px-1 text-[11px] text-subtle">
          Enter envia · Shift+Enter quebra a linha
          {c.bot.kind === "active" && c.pauseHoursOnReply > 0 ? ` · ao responder, o bot pausa por ${c.pauseHoursOnReply}h nesta conversa` : ""}
        </p>
      </div>
    </>
  );
}

function Bubble({ item, first }: { item: MessageItem; first: boolean }) {
  const mine = item.sender !== "contact";
  const tone = item.sender === "bot" ? "bg-bubble-bot" : item.sender === "human" ? "bg-bubble-team" : "bg-bubble-in";
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start", first ? "mt-3" : "mt-0.5")}>
      {first && mine ? (
        <span className="mb-1 inline-flex items-center gap-1 px-1 text-[11px] text-subtle">
          {item.sender === "bot" ? <Bot className="h-3 w-3 text-success" /> : <User className="h-3 w-3 text-info" />}
          {item.sender === "bot" ? "Bot" : item.author}
          {item.offHours ? " · fora do horário" : ""}
        </span>
      ) : null}
      <div className={cn("relative max-w-[min(34rem,78%)] rounded-xl text-[13.5px] leading-[1.45] text-foreground", tone, first && (mine ? "rounded-tr-sm" : "rounded-tl-sm"), item.media ? "p-1" : "px-3 py-1.5")}>
        {item.media ? <MediaView media={item.media} /> : null}
        {item.transcript ? <p className="px-2 pt-1 text-[12.5px] italic leading-snug text-foreground/75">“{item.transcript}”</p> : null}
        {item.body ? (
          <div className={cn(item.media && "px-2 pt-1")}>
            <span className="whitespace-pre-wrap break-words">{item.body}</span>
            {/* Reserva espaço na última linha para o horário, como no WhatsApp. */}
            <span className="invisible inline-block w-10" aria-hidden />
          </div>
        ) : null}
        {/* Mídia sem legenda: uma linha curta só para o horário. */}
        {item.media && !item.body ? <div className="h-4" aria-hidden /> : null}
        <span className="absolute bottom-1 right-2.5 text-[10px] tabular-nums text-muted">{item.time}</span>
      </div>
      {item.meta ? <span className="mt-1 px-1 text-[10.5px] text-subtle">{item.meta}</span> : null}
    </div>
  );
}

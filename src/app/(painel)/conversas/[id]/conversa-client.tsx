"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Bot, CheckCircle2, Clock, Pencil, ShieldCheck, Tag, User } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@/components/ui/primitives";
import { useDialogs } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { blockContactAction, pauseBotAction, resolveConversationAction, setCategoryAction } from "../actions";

export type ThreadItem =
  | { kind: "meta"; id: string; text: string }
  | { kind: "day"; id: string; label: string }
  | { kind: "message"; id: string; sender: "contact" | "bot" | "human"; body: string; time: string; offHours: boolean };

export type ConversaDetail = {
  id: string;
  title: string;
  numberLabel: string;
  status: "open" | "human" | "closed";
  needsHuman: boolean;
  handoffReason: string | null;
  category: string | null;
  messageCount: number;
  botMessageCount: number;
  humanMessageCount: number;
  createdAt: string;
  contact: {
    name: string | null;
    pushName: string | null;
    phone: string;
    isBlocked: boolean;
    pausedUntil: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
  };
  thread: ThreadItem[];
};

function statusMeta(d: ConversaDetail): { tone: "warning" | "info" | "neutral" | "success"; label: string } {
  if (d.needsHuman) return { tone: "warning", label: "precisa de humano" };
  if (d.status === "human") return { tone: "info", label: "com humano" };
  if (d.status === "closed") return { tone: "neutral", label: "encerrada" };
  return { tone: "success", label: "bot atendendo" };
}

export function ConversaClient({ detail }: { detail: ConversaDetail }) {
  const router = useRouter();
  const toast = useToast();
  const { confirmDialog, promptDialog } = useDialogs();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ error: string | null }>, okMessage: string) {
    setBusy(key);
    try {
      const res = await fn();
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(okMessage);
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const handleResolve = () => run("resolve", () => resolveConversationAction(detail.id), "Bot liberado para esta conversa.");
  const handlePause = () => run("pause", () => pauseBotAction(detail.id, 24), "Bot pausado por 24 horas nesta conversa.");

  const handleBlock = async () => {
    if (!detail.contact.isBlocked) {
      const ok = await confirmDialog("O contato deixa de receber respostas do bot e de qualquer automação. Você pode desbloquear quando quiser.", {
        title: "Bloquear este contato?",
        destructive: true,
        confirmLabel: "Bloquear",
      });
      if (!ok) return;
    }
    void run("block", () => blockContactAction(detail.id, !detail.contact.isBlocked), detail.contact.isBlocked ? "Contato desbloqueado." : "Contato bloqueado.");
  };

  const handleEditCategory = async () => {
    const value = await promptDialog("Categoria desta conversa:", detail.category ?? "", { title: "Corrigir categoria", placeholder: "ex.: Dúvida, Pedido, Reclamação…", confirmLabel: "Salvar" });
    if (value === null) return; // cancelou
    void run("category", () => setCategoryAction(detail.id, value), value.trim() ? "Categoria atualizada." : "Categoria removida.");
  };

  const badge = statusMeta(detail);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden">
        <div className="space-y-1 bg-[radial-gradient(circle_at_1px_1px,rgba(230,237,243,0.04)_1px,transparent_0)] bg-[length:18px_18px] p-4">
          {detail.thread.length === 0 ? (
            <EmptyState icon={<Bot className="h-6 w-6" />} title="Nenhuma mensagem ainda" description="Assim que o cliente escrever, as mensagens aparecem aqui." />
          ) : (
            detail.thread.map((item) => {
              if (item.kind === "day") {
                return (
                  <div key={item.id} className="flex justify-center py-2">
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted">{item.label}</span>
                  </div>
                );
              }
              if (item.kind === "meta") {
                return (
                  <div key={item.id} className="flex justify-center py-1">
                    <span className="max-w-[85%] text-center text-[11px] text-subtle">{item.text}</span>
                  </div>
                );
              }
              const mine = item.sender !== "contact";
              return (
                <div key={item.id} className={cn("flex py-0.5", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm", mine ? "bg-wa-out text-white" : "bg-wa-in text-foreground")}>
                    {item.sender === "human" ? (
                      <div className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                        <User className="h-3 w-3" /> atendente humano
                      </div>
                    ) : item.sender === "bot" ? (
                      <div className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                        <Bot className="h-3 w-3" /> bot
                      </div>
                    ) : null}
                    <div className="whitespace-pre-wrap">{item.body}</div>
                    <div className={cn("mt-1 text-right text-[10px]", mine ? "text-white/60" : "text-muted")}>
                      {item.offHours ? "fora do horário · " : ""}
                      {item.time}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="space-y-3 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Contato</div>
          <div>
            <div className="text-sm font-medium text-foreground">{detail.contact.name ?? detail.contact.pushName ?? detail.contact.phone}</div>
            <div className="text-xs text-muted">{detail.contact.phone}</div>
          </div>
          {detail.contact.isBlocked || detail.contact.pausedUntil ? (
            <div className="flex flex-wrap gap-1.5">
              {detail.contact.isBlocked ? <Badge tone="danger">bloqueado</Badge> : null}
              {detail.contact.pausedUntil ? <Badge tone="info">bot pausado até {detail.contact.pausedUntil}</Badge> : null}
            </div>
          ) : null}
          <div className="space-y-1 border-t border-border pt-3 text-xs text-muted">
            <div>Primeira mensagem: {detail.contact.firstSeenAt}</div>
            <div>Última atividade: {detail.contact.lastSeenAt}</div>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Conversa</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{detail.numberLabel}</Badge>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
          {detail.handoffReason ? <p className="text-xs text-warning">{detail.handoffReason}</p> : null}
          <button type="button" onClick={handleEditCategory} disabled={busy === "category"} className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-border-strong px-2 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground">
            <Tag className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate text-left">{detail.category ?? "sem categoria"}</span>
            <Pencil className="h-3 w-3 shrink-0 text-subtle" />
          </button>
          <div className="space-y-1 border-t border-border pt-3 text-xs text-muted">
            <div>{detail.messageCount} {detail.messageCount === 1 ? "mensagem" : "mensagens"} no total</div>
            <div>
              {detail.botMessageCount} do bot · {detail.humanMessageCount} da equipe
            </div>
            <div>Criada em {detail.createdAt}</div>
          </div>
        </Card>

        <Card className="space-y-2 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Ações</div>
          <Button variant="secondary" size="sm" className="w-full justify-start" loading={busy === "resolve"} onClick={handleResolve}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Liberar o bot / marcar resolvido
          </Button>
          <Button variant="secondary" size="sm" className="w-full justify-start" loading={busy === "pause"} onClick={handlePause}>
            <Clock className="h-3.5 w-3.5" /> Pausar bot por 24h
          </Button>
          <Button variant={detail.contact.isBlocked ? "secondary" : "danger"} size="sm" className="w-full justify-start" loading={busy === "block"} onClick={handleBlock}>
            {detail.contact.isBlocked ? <ShieldCheck className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
            {detail.contact.isBlocked ? "Desbloquear contato" : "Bloquear contato"}
          </Button>
          <p className="pt-1 text-[11px] text-subtle">O bot fica em silêncio quando alguém da equipe responde pelo celular ou quando ele pede atendimento humano.</p>
        </Card>
      </div>
    </div>
  );
}

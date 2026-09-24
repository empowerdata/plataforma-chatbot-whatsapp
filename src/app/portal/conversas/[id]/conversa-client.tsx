"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bot, Flag, Hand, Pencil, RotateCcw, Tag, User } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@/components/ui/primitives";
import { useDialogs } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { setPortalCategoryAction, setPortalResolvedAction } from "../actions";

export type PortalThreadItem =
  | { kind: "day"; id: string; label: string }
  | { kind: "message"; id: string; sender: "contact" | "bot" | "human"; body: string; time: string };

export type PortalConversaDetail = {
  id: string;
  title: string;
  numberLabel: string;
  needsHuman: boolean;
  category: string | null;
  resolved: boolean;
  messageCount: number;
  createdAt: string;
  contactPhone: string;
  lastSeenAt: string;
  thread: PortalThreadItem[];
};

export function PortalConversaClient({ detail }: { detail: PortalConversaDetail }) {
  const router = useRouter();
  const toast = useToast();
  const { promptDialog } = useDialogs();
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

  const handleToggleResolved = () =>
    run("toggle-resolved", () => setPortalResolvedAction(detail.id, !detail.resolved), detail.resolved ? "Conversa reaberta." : "Conversa marcada como finalizada.");

  const handleEditCategory = async () => {
    const value = await promptDialog("Categoria desta conversa:", detail.category ?? "", { title: "Corrigir categoria", placeholder: "ex.: Dúvida, Orçamento, Agendamento…", confirmLabel: "Salvar" });
    if (value === null) return;
    void run("category", () => setPortalCategoryAction(detail.id, value), value.trim() ? "Categoria atualizada." : "Categoria removida.");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <Card className="overflow-hidden">
        <div className="space-y-1 bg-[radial-gradient(circle_at_1px_1px,rgba(230,237,243,0.04)_1px,transparent_0)] bg-[length:18px_18px] p-4">
          {detail.thread.length === 0 ? (
            <EmptyState icon={<Bot className="h-6 w-6" />} title="Nenhuma mensagem ainda" />
          ) : (
            detail.thread.map((item) => {
              if (item.kind === "day") {
                return (
                  <div key={item.id} className="flex justify-center py-2">
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted">{item.label}</span>
                  </div>
                );
              }
              const mine = item.sender !== "contact";
              return (
                <div key={item.id} className={cn("flex py-0.5", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm", mine ? "bg-wa-out text-white" : "bg-wa-in text-foreground")}>
                    {item.sender === "human" ? (
                      <div className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                        <User className="h-3 w-3" /> atendente
                      </div>
                    ) : item.sender === "bot" ? (
                      <div className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                        <Bot className="h-3 w-3" /> bot
                      </div>
                    ) : null}
                    <div className="whitespace-pre-wrap">{item.body}</div>
                    <div className={cn("mt-1 text-right text-[10px]", mine ? "text-white/60" : "text-muted")}>{item.time}</div>
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
          <div className="text-sm font-medium text-foreground">{detail.contactPhone}</div>
          <div className="space-y-1 border-t border-border pt-3 text-xs text-muted">
            <div>Última atividade: {detail.lastSeenAt}</div>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Conversa</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{detail.numberLabel}</Badge>
            <Badge tone={detail.resolved ? "success" : "neutral"}>{detail.resolved ? "finalizada" : "em aberto"}</Badge>
            {detail.needsHuman ? (
              <Badge tone="warning">
                <Hand className="mr-1 h-3 w-3" /> precisa de retorno
              </Badge>
            ) : null}
          </div>
          <button type="button" onClick={handleEditCategory} disabled={busy === "category"} className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-border-strong px-2 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground">
            <Tag className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate text-left">{detail.category ?? "sem categoria"}</span>
            <Pencil className="h-3 w-3 shrink-0 text-subtle" />
          </button>
          <div className="space-y-1 border-t border-border pt-3 text-xs text-muted">
            <div>{detail.messageCount} {detail.messageCount === 1 ? "mensagem" : "mensagens"} no total</div>
            <div>Criada em {detail.createdAt}</div>
          </div>
        </Card>

        <Card className="space-y-2 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Ações</div>
          <Button variant="secondary" size="sm" className="w-full justify-start" loading={busy === "toggle-resolved"} onClick={handleToggleResolved}>
            {detail.resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <Flag className="h-3.5 w-3.5" />}
            {detail.resolved ? "Reabrir conversa" : "Marcar como finalizada"}
          </Button>
        </Card>
      </div>
    </div>
  );
}

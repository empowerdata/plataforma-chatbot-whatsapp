"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Hand, MessagesSquare, Smartphone } from "lucide-react";
import { Badge, Button, EmptyState, Select, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export type ConversationRow = {
  id: string;
  /** Nome do contato (ou telefone formatado quando não há nome). */
  title: string;
  /** Telefone formatado; null quando o telefone já é o título. */
  phone: string | null;
  numberLabel: string;
  preview: string | null;
  status: "open" | "human" | "closed";
  needsHuman: boolean;
  /** Já formatado no servidor (ex.: "há 5 min"). */
  lastMessageAt: string;
  messageCount: number;
};

type NumberOption = { id: string; label: string };

function badgeFor(c: ConversationRow): { tone: "warning" | "info" | "neutral" | "success"; label: string } {
  if (c.needsHuman) return { tone: "warning", label: "precisa de humano" };
  if (c.status === "human") return { tone: "info", label: "com humano" };
  if (c.status === "closed") return { tone: "neutral", label: "encerrada" };
  return { tone: "success", label: "bot" };
}

export function ConversasClient({ numbers, numberId, needsHuman, rows }: { numbers: NumberOption[]; numberId: string | null; needsHuman: boolean; rows: ConversationRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const apply = (next: { numberId: string | null; needsHuman: boolean }) => {
    const qs = new URLSearchParams();
    if (next.numberId) qs.set("numero", next.numberId);
    if (next.needsHuman) qs.set("humano", "1");
    const search = qs.toString();
    startTransition(() => router.replace(search ? `/conversas?${search}` : "/conversas"));
  };

  const filtered = numberId !== null || needsHuman;

  if (numbers.length === 0) {
    return (
      <EmptyState
        icon={<Smartphone className="h-6 w-6" />}
        title="Nenhum número conectado"
        description="As conversas aparecem aqui assim que você conectar o WhatsApp do seu primeiro cliente."
        action={
          <Link href="/numeros" className="text-sm text-accent hover:underline">
            Ir para Números
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={numberId ?? ""} onChange={(e) => apply({ numberId: e.target.value || null, needsHuman })} className="w-56" aria-label="Filtrar por número">
          <option value="">Todos os números</option>
          {numbers.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="outline"
          aria-pressed={needsHuman}
          onClick={() => apply({ numberId, needsHuman: !needsHuman })}
          className={cn(needsHuman && "border-warning/40 bg-warning-soft text-warning hover:bg-warning-soft")}
        >
          <Hand className="h-3.5 w-3.5" /> Precisa de humano
        </Button>
        {pending ? <Spinner /> : null}
        <span className="ml-auto text-xs text-muted">
          {rows.length === 1 ? "1 conversa" : `${rows.length} conversas`}
          {rows.length >= 100 ? " (mostrando as 100 mais recentes)" : ""}
        </span>
      </div>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<MessagesSquare className="h-6 w-6" />}
            title="Nenhuma conversa com esses filtros"
            description="Tente outro número ou desligue o filtro de atendimento humano."
            action={
              <Button variant="secondary" size="sm" onClick={() => apply({ numberId: null, needsHuman: false })}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState icon={<MessagesSquare className="h-6 w-6" />} title="Nenhuma conversa ainda" description="Assim que um cliente mandar mensagem para um número conectado, a conversa aparece aqui." />
        )
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-surface-1">
          {rows.map((c) => {
            const badge = badgeFor(c);
            return (
              <Link key={c.id} href={`/conversas/${c.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-medium text-foreground">{c.title}</span>
                    {c.phone ? <span className="text-xs text-muted">{c.phone}</span> : null}
                    <span className="rounded border border-border bg-surface-2 px-1.5 text-[10px] leading-4 text-muted">{c.numberLabel}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">{c.preview ?? "Sem mensagens ainda."}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                  <div className="hidden w-16 text-right text-[11px] text-muted sm:block">
                    <div>{c.lastMessageAt}</div>
                    <div>
                      {c.messageCount} {c.messageCount === 1 ? "msg" : "msgs"}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-subtle" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { BotState, ConversationStatus } from "./types";

/** Situação da conversa: rótulo curto, cor do ponto e cor do texto. Cor sempre acompanhada do rótulo. */
export const STATUS_META: Record<ConversationStatus, { label: string; dot: string; text: string }> = {
  aguardando: { label: "Aguardando você", dot: "bg-warning", text: "text-warning" },
  bot: { label: "Bot atendendo", dot: "bg-success", text: "text-success" },
  equipe: { label: "Com a equipe", dot: "bg-info", text: "text-info" },
  finalizada: { label: "Finalizada", dot: "bg-subtle", text: "text-muted" },
};

export function StatusLabel({ status, className }: { status: ConversationStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", m.text, className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

/** Avatar neutro com iniciais; o ponto mostra a situação da conversa. */
export function Avatar({ initials, status, size = "md" }: { initials: string; status?: ConversationStatus; size?: "sm" | "md" | "lg" }) {
  const dim = { sm: "h-8 w-8 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" }[size];
  const dot = { sm: "h-2.5 w-2.5 -bottom-0.5 -right-0.5", md: "h-2.5 w-2.5 -bottom-0.5 -right-0.5", lg: "h-3 w-3 bottom-0 right-0" }[size];
  return (
    <span className={cn("relative inline-flex shrink-0 select-none items-center justify-center rounded-full bg-surface-3 font-semibold text-foreground/75", dim)}>
      {initials}
      {status && status !== "finalizada" ? <span className={cn("absolute rounded-full ring-2 ring-surface-1", dot, STATUS_META[status].dot)} /> : null}
    </span>
  );
}

/** Título curto do estado do bot. */
export function botLabel(state: BotState): string {
  switch (state.kind) {
    case "active":
      return "Bot ligado";
    case "paused":
      return "Bot pausado";
    case "off":
      return "Bot desligado";
    case "blocked":
      return "Contato bloqueado";
    case "number_off":
      return "Bot desligado no número";
    default:
      return "Sem bot";
  }
}

/** Explicação em uma frase — o "porquê" de o bot estar ou não respondendo. */
export function botExplanation(state: BotState, audience: "staff" | "client"): string {
  switch (state.kind) {
    case "active":
      return "O bot responde este contato sozinho.";
    case "paused":
      if (state.reason === "handoff") return `O bot chamou alguém da equipe e fica em silêncio até ${state.until}.`;
      if (state.reason === "human_reply") return `Alguém da equipe respondeu, então o bot pausou até ${state.until}.`;
      return `O bot está pausado nesta conversa até ${state.until}.`;
    case "off":
      return "Bot desligado nesta conversa: só a equipe responde aqui.";
    case "blocked":
      return "Contato bloqueado: o bot não responde e nenhuma automação roda para ele.";
    case "number_off":
      return audience === "staff" ? "O bot está desligado para o número inteiro. Religue em Números." : "O bot está desligado neste número. Fale com quem administra o seu atendimento.";
    default:
      return audience === "staff" ? "Este número não tem um bot ativo. Escolha um em Números." : "Este número ainda não tem um bot configurado.";
  }
}

/** Menu suspenso simples (sem lib extra): fecha ao clicar fora ou com Esc. */
export function Popover({ trigger, children, align = "start", className }: { trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode; children: (close: () => void) => React.ReactNode; align?: "start" | "end"; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open ? (
        <div className={cn("absolute top-full z-30 mt-1 min-w-[190px] overflow-hidden rounded-lg border border-border-strong bg-surface-2 p-1 shadow-2xl animate-scale-in", align === "end" ? "right-0" : "left-0", className)}>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({ onClick, children, tone, active }: { onClick: () => void; children: React.ReactNode; tone?: "danger"; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-3",
        tone === "danger" ? "text-danger" : "text-foreground/90",
        active && "text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-subtle">{children}</div>;
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}

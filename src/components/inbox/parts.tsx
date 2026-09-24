"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { BotState, InboxListItem } from "./types";

type BotDot = InboxListItem["bot"];

const DOT: Record<BotDot, string | null> = {
  active: "bg-success",
  paused: "bg-warning",
  off: "bg-subtle",
  unavailable: null,
};

/** Avatar neutro com iniciais; a bolinha é o único sinal de cor — o estado do bot nesta conversa. */
export function Avatar({ initials, bot, size = "md" }: { initials: string; bot?: BotDot; size?: "md" | "lg" }) {
  const dot = bot ? DOT[bot] : null;
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold text-foreground/80", size === "lg" ? "h-14 w-14 text-base" : "h-9 w-9 text-xs")}>
      {initials}
      {dot ? <span className={cn("absolute rounded-full ring-2 ring-surface-1", dot, size === "lg" ? "bottom-0.5 right-0.5 h-3 w-3" : "-bottom-0.5 -right-0.5 h-2.5 w-2.5")} /> : null}
    </span>
  );
}

export function botDot(state: BotState): BotDot {
  return state.kind === "active" || state.kind === "off" || state.kind === "paused" ? state.kind : "unavailable";
}

/** Título curto do estado do bot, para o controle no topo da conversa. */
export function botLabel(state: BotState): string {
  switch (state.kind) {
    case "active":
      return "Bot ativo";
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
      if (state.reason === "handoff") return `O bot chamou alguém da equipe e fica em silêncio nesta conversa até ${state.until}.`;
      if (state.reason === "human_reply") return `Alguém da equipe respondeu, então o bot pausou nesta conversa até ${state.until}.`;
      return `O bot está pausado nesta conversa até ${state.until}.`;
    case "off":
      return "Desligado à mão nesta conversa — só a equipe responde aqui, até alguém religar.";
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
        <div className={cn("absolute top-full z-30 mt-1 min-w-[200px] overflow-hidden rounded-md border border-border-strong bg-surface-2 py-1 shadow-2xl animate-scale-in", align === "end" ? "right-0" : "left-0", className)}>
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
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-3",
        tone === "danger" ? "text-danger" : "text-foreground",
        active && "text-accent",
      )}
    >
      {children}
    </button>
  );
}

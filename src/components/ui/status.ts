/**
 * Tipos e helpers de "tom" (cor semântica) sem nenhuma dependência de React
 * client-only. Fica fora de primitives.tsx (que é "use client") porque
 * numberStatusMeta() é chamado direto em Server Components — uma função só
 * pode ser importada de um Server Component se o módulo que a exporta não
 * tiver "use client".
 */

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
  accent: "bg-accent-soft text-accent border-transparent",
};

export const toneDotClasses: Record<Tone, string> = {
  neutral: "bg-subtle",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  accent: "bg-accent",
};

/** Estado de conexão de um número → rótulo e cor. */
export function numberStatusMeta(status: string): { label: string; tone: Tone; pulse?: boolean } {
  switch (status) {
    case "open":
      return { label: "Conectado", tone: "success" };
    case "qr":
      return { label: "Aguardando QR", tone: "warning", pulse: true };
    case "connecting":
      return { label: "Conectando", tone: "info", pulse: true };
    case "close":
      return { label: "Desconectado", tone: "danger" };
    case "banned":
      return { label: "Banido", tone: "danger" };
    default:
      return { label: "Criado", tone: "neutral" };
  }
}

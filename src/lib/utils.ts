import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Fuso de exibição. O servidor (container) roda em UTC; sem fuso explícito
 * todo horário na tela saía 3 horas adiantado.
 */
export const DISPLAY_TZ = "America/Sao_Paulo";

function toDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: DISPLAY_TZ }).format(toDate(d));
}

/** "14:32" no fuso de exibição. */
export function formatTime(d: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TZ }).format(toDate(d));
}

/** Chave do dia (AAAA-MM-DD) no fuso de exibição — para agrupar mensagens por dia. */
export function dayKey(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: DISPLAY_TZ }).format(toDate(d));
}

/** "Hoje", "Ontem" ou "12 de setembro" (com ano se não for o atual). */
export function formatDayLabel(d: Date | string): string {
  const date = toDate(d);
  const now = new Date();
  const key = dayKey(date);
  if (key === dayKey(now)) return "Hoje";
  if (key === dayKey(new Date(now.getTime() - 86400_000))) return "Ontem";
  const sameYear = key.slice(0, 4) === dayKey(now).slice(0, 4);
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }), timeZone: DISPLAY_TZ }).format(date);
}

/** Horário curto para listas: "14:32" hoje, "Ontem", dia da semana nesta semana, senão "12/09". */
export function formatListTime(d: Date | string): string {
  const date = toDate(d);
  const now = new Date();
  const key = dayKey(date);
  if (key === dayKey(now)) return formatTime(date);
  if (key === dayKey(new Date(now.getTime() - 86400_000))) return "Ontem";
  if (now.getTime() - date.getTime() < 6 * 86400_000) {
    const wd = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: DISPLAY_TZ }).format(date).replace(".", "");
    return wd.charAt(0).toUpperCase() + wd.slice(1);
  }
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: DISPLAY_TZ }).format(date);
}

/** Iniciais para avatar ("Ana Paula" → "AP", telefone → "#"). */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "#";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

export function formatRelative(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = toDate(d);
  const diff = Date.now() - date.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return `há ${days} d`;
  return formatDateTime(date);
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return `+${digits}`;
}

export function formatNumber(n: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR").format(n ?? 0);
}

export function formatBRL(n: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

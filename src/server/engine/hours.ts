import { weekDayLabels, weekDays, type BusinessHours, type WeekDay } from "@/shared/bot-config";

const DAY_INDEX: Record<number, WeekDay> = { 0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab" };

/** Dia da semana e hora local ("HH:MM") de um instante num fuso. */
export function localParts(now: Date, timezone: string): { day: WeekDay; time: string } {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
    const parts = fmt.formatToParts(now);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
    const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
    const map: Record<string, WeekDay> = { Sun: "dom", Mon: "seg", Tue: "ter", Wed: "qua", Thu: "qui", Fri: "sex", Sat: "sab" };
    return { day: map[wd] ?? "seg", time: `${hh === "24" ? "00" : hh}:${mm}` };
  } catch {
    return { day: DAY_INDEX[now.getDay()], time: now.toTimeString().slice(0, 5) };
  }
}

/** true/false se o horário está habilitado; null quando o bot não usa horário. */
export function isOpenNow(hours: BusinessHours | undefined, now = new Date()): boolean | null {
  if (!hours?.enabled) return null;
  const { day, time } = localParts(now, hours.timezone || "America/Sao_Paulo");
  const d = hours.days[day];
  if (!d || !d.open) return false;
  if (d.from <= d.to) return time >= d.from && time < d.to;
  // Atravessa a meia-noite (ex.: 18:00 → 02:00)
  return time >= d.from || time < d.to;
}

/** Texto amigável do horário para o prompt e para o cliente. */
export function describeHours(hours: BusinessHours | undefined): string {
  if (!hours?.enabled) return "";
  const lines: string[] = [];
  for (const day of weekDays) {
    const d = hours.days[day];
    if (!d) continue;
    lines.push(`${weekDayLabels[day]}: ${d.open ? `${d.from} às ${d.to}` : "fechado"}`);
  }
  return lines.join("; ");
}

export function nowDescription(now: Date, timezone = "America/Sao_Paulo"): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(now);
  } catch {
    return now.toLocaleString("pt-BR");
  }
}

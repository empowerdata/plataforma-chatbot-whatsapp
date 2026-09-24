import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireClientAccess } from "@/server/auth/guards";
import { getPortalConversationDetail } from "@/server/services/portal";
import type { MessageRow } from "@/server/tenant";
import { PageHeader } from "@/components/ui/primitives";
import { formatDateTime, formatPhone, formatRelative } from "@/lib/utils";
import { PortalConversaClient, type PortalConversaDetail, type PortalThreadItem } from "./conversa-client";

export const metadata = { title: "Conversa" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default async function PortalConversaPage(props: PageProps<"/portal/conversas/[id]">) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();
  const { client } = await requireClientAccess();

  const detail = await getPortalConversationDetail(client.accountId, client.id, id);
  if (!detail) notFound();

  const dto = toDto(detail);
  return (
    <div className="animate-fade-in-up">
      <Link href="/portal/conversas" className="mb-3 inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Todas as conversas
      </Link>
      <PageHeader title={dto.title} description={`${dto.contactPhone} · pelo número ${dto.numberLabel}`} />
      <PortalConversaClient detail={dto} />
    </div>
  );
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d: Date): string {
  const now = new Date();
  const key = dayKey(d);
  if (key === dayKey(now)) return "Hoje";
  if (key === dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return "Ontem";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("pt-BR", opts);
}

function bubbleBody(m: MessageRow): string {
  const text = (m.text ?? "").trim();
  const tagged = (tag: string) => (text ? (text.startsWith("[") ? text : `${tag} ${text}`) : tag);
  switch (m.type) {
    case "text":
      return text || "[mensagem vazia]";
    case "audio":
      return m.transcript?.trim() ? `🎤 ${m.transcript.trim()}` : "🎤 [áudio]";
    case "image":
      return tagged("[imagem]");
    case "video":
      return tagged("[vídeo]");
    case "document":
      return tagged("[documento]");
    case "location":
      return tagged("[localização]");
    case "sticker":
      return "[figurinha]";
    default:
      return text || "[mídia]";
  }
}

function buildThread(messages: MessageRow[]): PortalThreadItem[] {
  const items: PortalThreadItem[] = [];
  let lastDay: string | null = null;
  for (const m of messages) {
    if (m.sender === "system") continue; // detalhe técnico interno, não é conversa
    const at = toDate(m.created_at) ?? new Date(0);
    const key = dayKey(at);
    if (key !== lastDay) {
      items.push({ kind: "day", id: `day-${key}`, label: dayLabel(at) });
      lastDay = key;
    }
    items.push({ kind: "message", id: m.id, sender: m.sender, body: bubbleBody(m), time: timeFmt.format(at) });
  }
  return items;
}

function toDto(d: Awaited<ReturnType<typeof getPortalConversationDetail>>): PortalConversaDetail {
  if (!d) throw new Error("unreachable");
  const { conversation: c, contact, messages } = d;
  const name = contact.name ?? contact.push_name ?? null;
  return {
    id: c.id,
    title: name ?? formatPhone(contact.phone),
    numberLabel: d.numberLabel,
    needsHuman: c.needs_human,
    category: c.category,
    resolved: c.resolved_at != null,
    messageCount: Number(c.message_count ?? 0),
    createdAt: formatDateTime(c.created_at),
    contactPhone: formatPhone(contact.phone),
    lastSeenAt: formatRelative(contact.last_seen_at),
    thread: buildThread(messages),
  };
}

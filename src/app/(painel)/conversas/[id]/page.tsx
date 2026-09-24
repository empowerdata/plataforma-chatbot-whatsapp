import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Database } from "lucide-react";
import { requireAccount } from "@/server/auth/guards";
import { getConversationDetail, type ConversationDetail } from "@/server/services/conversations";
import { TenantNotConfigured, type MessageRow } from "@/server/tenant";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDateTime, formatNumber, formatPhone, formatRelative } from "@/lib/utils";
import { ConversaClient, type ConversaDetail, type ThreadItem } from "./conversa-client";

export const metadata = { title: "Conversa" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversaPage(props: PageProps<"/conversas/[id]">) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();
  const { account } = await requireAccount();

  let detail: ConversationDetail | null = null;
  try {
    detail = await getConversationDetail(account.id, id);
  } catch (err) {
    if (!(err instanceof TenantNotConfigured)) throw err;
    return (
      <div className="animate-fade-in-up">
        <PageHeader title="Conversa" />
        <EmptyState
          icon={<Database className="h-6 w-6" />}
          title="Supabase ainda não conectado"
          description="As conversas ficam guardadas no banco de dados da sua conta. Conecte o seu Supabase em Integrações para vê-las aqui."
          action={
            <Link href="/integracoes" className="text-sm text-accent hover:underline">
              Ir para Integrações
            </Link>
          }
        />
      </div>
    );
  }
  if (!detail) notFound();

  const dto = toDto(detail);
  return (
    <div className="animate-fade-in-up">
      <Link href="/conversas" className="mb-3 inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Todas as conversas
      </Link>
      <PageHeader title={dto.title} description={`${dto.contact.phone} · pelo número ${dto.numberLabel}`} />
      <ConversaClient detail={dto} />
    </div>
  );
}

// ------------------------------------------------------------ formatação (servidor)

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Nomes amigáveis das ações que o bot pode executar durante uma resposta. */
const TOOL_LABELS: Record<string, string> = {
  chamar_atendente: "chamou a equipe",
  enviar_cardapio: "enviou o cardápio",
  enviar_localizacao: "enviou a localização",
  categorizar_conversa: "categorizou",
};

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

/** "HH:MM" quando é hoje, senão data e hora; null quando o bot não está pausado. */
function pausedLabel(until: Date | null): string | null {
  if (!until || until.getTime() <= Date.now()) return null;
  return dayKey(until) === dayKey(new Date()) ? timeFmt.format(until) : formatDateTime(until);
}

function metaOf(m: MessageRow): Record<string, unknown> {
  const raw: unknown = m.meta;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

/** Texto do balão conforme o tipo da mensagem. */
function bubbleBody(m: MessageRow): string {
  const text = (m.text ?? "").trim();
  const tagged = (tag: string) => (text ? (text.startsWith("[") ? text : `${tag} ${text}`) : tag);
  switch (m.type) {
    case "text":
      return text || "[mensagem vazia]";
    case "audio":
      return m.transcript?.trim() ? `🎤 ${m.transcript.trim()}` : "🎤 [áudio sem transcrição]";
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

/** Linha discreta para as mensagens de sistema (custo/modelo de cada resposta). */
function systemLine(m: MessageRow): string | null {
  const meta = metaOf(m);
  const simulated = meta.simulated === true;
  if (!simulated && !m.model) return null;
  const parts = [simulated ? "resposta simulada (sem chave da OpenAI)" : `resposta gerada por ${m.model}`];
  if (m.latency_ms != null && m.latency_ms >= 0) parts.push(`${(m.latency_ms / 1000).toFixed(1).replace(".", ",")}s`);
  const tokens = Number(m.tokens_in ?? 0) + Number(m.tokens_out ?? 0);
  if (tokens > 0) parts.push(`${formatNumber(tokens)} tokens`);
  const tools = Array.isArray(meta.toolCalls) ? meta.toolCalls.filter((t): t is string => typeof t === "string") : [];
  if (tools.length) parts.push(tools.map((t) => TOOL_LABELS[t] ?? t).join(", "));
  return parts.join(" · ");
}

function buildThread(messages: MessageRow[]): ThreadItem[] {
  const items: ThreadItem[] = [];
  let lastDay: string | null = null;
  for (const m of messages) {
    const sender = m.sender;
    if (sender === "system") {
      const text = systemLine(m);
      if (text) items.push({ kind: "meta", id: m.id, text });
      continue;
    }
    const at = toDate(m.created_at) ?? new Date(0);
    const key = dayKey(at);
    if (key !== lastDay) {
      items.push({ kind: "day", id: `day-${key}`, label: dayLabel(at) });
      lastDay = key;
    }
    items.push({ kind: "message", id: m.id, sender, body: bubbleBody(m), time: timeFmt.format(at), offHours: metaOf(m).offHours === true });
  }
  return items;
}

function toDto(d: ConversationDetail): ConversaDetail {
  const { conversation: c, contact, messages } = d;
  const name = contact.name ?? contact.push_name ?? null;
  return {
    id: c.id,
    title: name ?? formatPhone(contact.phone),
    numberLabel: d.numberLabel,
    status: c.status,
    needsHuman: c.needs_human,
    handoffReason: c.handoff_reason,
    category: c.category,
    resolved: c.resolved_at != null,
    messageCount: Number(c.message_count ?? 0),
    botMessageCount: Number(c.bot_message_count ?? 0),
    humanMessageCount: Number(c.human_message_count ?? 0),
    createdAt: formatDateTime(c.created_at),
    contact: {
      name: contact.name,
      pushName: contact.push_name,
      phone: formatPhone(contact.phone),
      isBlocked: contact.is_blocked === true,
      pausedUntil: pausedLabel(toDate(contact.bot_paused_until)),
      firstSeenAt: formatDateTime(contact.first_seen_at),
      lastSeenAt: formatRelative(contact.last_seen_at),
    },
    thread: buildThread(messages),
  };
}

import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getTenantStore, TenantNotConfigured } from "../tenant";
import { dayKey } from "@/lib/utils";

export type Overview = {
  available: boolean;
  totals: { conversations: number; messagesIn: number; messagesOut: number; botMessages: number; humanMessages: number; newContacts: number; handoffs: number; tokensIn: number; tokensOut: number };
  today: { conversations: number; messagesIn: number; messagesOut: number; handoffs: number };
  series: { day: string; conversations: number; messages: number; handoffs: number }[];
  numbers: { id: string; label: string; status: string; clientName: string | null; botName: string | null; conversations: number; messages: number; lastMessageAt: Date | null; phone: string | null }[];
  needsHuman: number;
  contacts: number;
  days: number;
};

const empty = (days: number): Overview => ({
  available: false,
  totals: { conversations: 0, messagesIn: 0, messagesOut: 0, botMessages: 0, humanMessages: 0, newContacts: 0, handoffs: 0, tokensIn: 0, tokensOut: 0 },
  today: { conversations: 0, messagesIn: 0, messagesOut: 0, handoffs: 0 },
  series: [],
  numbers: [],
  needsHuman: 0,
  contacts: 0,
  days,
});

export async function getOverview(accountId: string, days = 30): Promise<Overview> {
  const db = await getDb();
  const numbers = await db
    .select({ id: schema.numbers.id, label: schema.numbers.label, status: schema.numbers.status, clientName: schema.clients.name, botName: schema.bots.name, lastMessageAt: schema.numbers.lastMessageAt, phone: schema.numbers.phone })
    .from(schema.numbers)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.numbers.clientId))
    .leftJoin(schema.bots, eq(schema.bots.id, schema.numbers.botId))
    .where(eq(schema.numbers.accountId, accountId))
    .orderBy(desc(schema.numbers.createdAt));

  const out = empty(days);
  out.numbers = numbers.map((n) => ({ ...n, conversations: 0, messages: 0 }));
  if (!numbers.length) return { ...out, available: true };

  let store;
  try {
    store = await getTenantStore(accountId);
  } catch (err) {
    if (err instanceof TenantNotConfigured) return out;
    throw err;
  }
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400_000);
  const ids = numbers.map((n) => n.id);
  const rows = await store.dailyStats(ids, from, to);
  const todayStr = dayKey(to);
  const byDay = new Map<string, { conversations: number; messages: number; handoffs: number }>();
  for (let i = 0; i < days; i++) {
    const d = dayKey(new Date(from.getTime() + i * 86400_000));
    byDay.set(d, { conversations: 0, messages: 0, handoffs: 0 });
  }
  const perNumber = new Map<string, { conversations: number; messages: number }>();
  for (const r of rows) {
    out.totals.conversations += r.conversations;
    out.totals.messagesIn += r.messages_in;
    out.totals.messagesOut += r.messages_out;
    out.totals.botMessages += r.bot_messages;
    out.totals.humanMessages += r.human_messages;
    out.totals.newContacts += r.new_contacts;
    out.totals.handoffs += r.handoffs;
    out.totals.tokensIn += r.tokens_in;
    out.totals.tokensOut += r.tokens_out;
    if (r.day === todayStr) {
      out.today.conversations += r.conversations;
      out.today.messagesIn += r.messages_in;
      out.today.messagesOut += r.messages_out;
      out.today.handoffs += r.handoffs;
    }
    const d = byDay.get(r.day);
    if (d) {
      d.conversations += r.conversations;
      d.messages += r.messages_in + r.messages_out;
      d.handoffs += r.handoffs;
    }
    const pn = perNumber.get(r.number_id) ?? { conversations: 0, messages: 0 };
    pn.conversations += r.conversations;
    pn.messages += r.messages_in + r.messages_out;
    perNumber.set(r.number_id, pn);
  }
  out.series = [...byDay.entries()].map(([day, v]) => ({ day, ...v }));
  out.numbers = numbers.map((n) => ({ ...n, ...(perNumber.get(n.id) ?? { conversations: 0, messages: 0 }) }));
  out.needsHuman = await store.countOpenNeedsHuman(ids);
  out.contacts = await store.contactsCount(ids);
  out.available = true;
  return out;
}

/** Custo estimado em dólares para tokens de entrada/saída (ordem de grandeza, modelo mini). */
export function estimateCostUsd(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * 0.25 + (tokensOut / 1_000_000) * 2;
}

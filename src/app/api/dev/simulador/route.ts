import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/server/env";
import { getAccountOrThrow, AuthError } from "@/server/auth/guards";
import { getNumber } from "@/server/services/numbers";
import { getFakeEvolution } from "@/server/evolution/fake";
import { getTenantStore } from "@/server/tenant";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("scan"), numberId: z.string().uuid(), phone: z.string().min(8), profileName: z.string().optional() }),
  z.object({ action: z.literal("disconnect"), numberId: z.string().uuid() }),
  z.object({ action: z.literal("incoming"), numberId: z.string().uuid(), fromPhone: z.string().min(8), text: z.string().min(1).max(2000), pushName: z.string().optional() }),
  z.object({ action: z.literal("human"), numberId: z.string().uuid(), toPhone: z.string().min(8), text: z.string().min(1).max(2000) }),
]);

/** Ações da Evolution simulada (só em dev). */
export async function POST(req: Request) {
  if (!env.devSimulator) return NextResponse.json({ error: "Simulador desativado." }, { status: 404 });
  try {
    const { account } = await getAccountOrThrow();
    const body = bodySchema.parse(await req.json());
    const number = await getNumber(account.id, body.numberId);
    if (!number) return NextResponse.json({ error: "Número não encontrado." }, { status: 404 });
    const fake = getFakeEvolution();
    switch (body.action) {
      case "scan":
        await fake.simulateScan(number.instanceName, body.phone, body.profileName);
        break;
      case "disconnect":
        await fake.simulateDisconnect(number.instanceName);
        break;
      case "incoming":
        await fake.simulateIncoming(number.instanceName, { fromPhone: body.fromPhone, text: body.text, pushName: body.pushName });
        break;
      case "human":
        await fake.simulateHumanReply(number.instanceName, { toPhone: body.toPhone, text: body.text });
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}

/** Conversa de um contato simulado com um número: mensagens do banco do aluno. */
export async function GET(req: Request) {
  if (!env.devSimulator) return NextResponse.json({ error: "Simulador desativado." }, { status: 404 });
  try {
    const { account } = await getAccountOrThrow();
    const url = new URL(req.url);
    const numberId = url.searchParams.get("numberId") ?? "";
    const phone = (url.searchParams.get("phone") ?? "").replace(/\D/g, "");
    const number = await getNumber(account.id, numberId);
    if (!number || !phone) return NextResponse.json({ messages: [], status: number?.status ?? "unknown" });
    const store = await getTenantStore(account.id);
    const contact = await store.upsertContact({ numberId: number.id, jid: `${phone}@s.whatsapp.net`, phone });
    const { conversation } = await store.getOrCreateConversation({ numberId: number.id, contactId: contact.id, timeoutHours: number.settings.conversationTimeoutHours ?? 12 });
    const messages = await store.listMessages(conversation.id, 100);
    return NextResponse.json({
      status: number.status,
      conversation: { id: conversation.id, status: conversation.status, needsHuman: conversation.needs_human },
      contact: { id: contact.id, pausedUntil: contact.bot_paused_until, blocked: contact.is_blocked },
      messages: messages
        .filter((m) => m.sender !== "system")
        .map((m) => ({ id: m.id, sender: m.sender, type: m.type, text: m.text ?? m.transcript ?? "", at: m.created_at })),
    });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}

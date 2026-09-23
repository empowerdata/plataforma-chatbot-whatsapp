import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { parseWebhook } from "@/server/evolution/webhook-parser";
import { handleWebhookEvent } from "@/server/engine/inbound";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webhook da Evolution: uma URL por número (token secreto).
 * Responde 200 imediatamente e processa depois (after), como a Evolution espera.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/webhooks/evolution/[token]">) {
  const { token } = await ctx.params;
  const db = await getDb();
  const [number] = await db.select({ id: schema.numbers.id }).from(schema.numbers).where(eq(schema.numbers.webhookToken, token)).limit(1);
  if (!number) return NextResponse.json({ ok: false, error: "unknown token" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const event = parseWebhook(body);
  after(async () => {
    try {
      await handleWebhookEvent(number.id, event);
    } catch (err) {
      console.error("[webhook] erro ao processar evento", event.type, err);
    }
  });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "Webhook da Evolution. Use POST." });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountOrThrow, AuthError } from "@/server/auth/guards";
import { runPlaygroundTurn } from "@/server/engine/playground";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  botId: z.string().uuid().nullable().optional(),
  config: z.record(z.string(), z.unknown()),
  variables: z.record(z.string(), z.string()).optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })).max(40),
  userText: z.string().min(1).max(4000),
});

/** Conversa de teste do Studio (não grava nada). */
export async function POST(req: Request) {
  try {
    const { account } = await getAccountOrThrow();
    const body = bodySchema.parse(await req.json());
    const result = await runPlaygroundTurn({ accountId: account.id, botId: body.botId ?? null, config: body.config, variables: body.variables, history: body.history, userText: body.userText });
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}

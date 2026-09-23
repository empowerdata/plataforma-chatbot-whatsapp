import { NextResponse } from "next/server";
import { getAccountOrThrow, AuthError } from "@/server/auth/guards";
import { getConnectionInfo } from "@/server/services/numbers";

export const dynamic = "force-dynamic";

/** Estado da conexão + QR atual (a tela de conexão consulta a cada poucos segundos). */
export async function GET(req: Request, ctx: RouteContext<"/api/numeros/[id]/conexao">) {
  try {
    const { id } = await ctx.params;
    const { account } = await getAccountOrThrow();
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    const info = await getConnectionInfo(account.id, id, { refresh });
    return NextResponse.json(info);
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}

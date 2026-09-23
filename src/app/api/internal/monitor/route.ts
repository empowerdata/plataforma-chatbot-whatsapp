import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { runMonitorOnce } from "@/server/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Cron externo (opcional): GET /api/internal/monitor com header x-internal-token. */
export async function GET(req: Request) {
  if (env.INTERNAL_TOKEN) {
    const token = req.headers.get("x-internal-token") ?? new URL(req.url).searchParams.get("token");
    if (token !== env.INTERNAL_TOKEN) return NextResponse.json({ ok: false }, { status: 401 });
  } else if (env.isProd) {
    return NextResponse.json({ ok: false, error: "INTERNAL_TOKEN não configurado" }, { status: 403 });
  }
  const result = await runMonitorOnce();
  return NextResponse.json({ ok: true, ...result });
}

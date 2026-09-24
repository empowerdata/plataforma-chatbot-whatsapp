import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AuthError } from "@/server/auth/guards";
import { sendInboxMedia } from "@/server/services/inbox";
import { TenantNotConfigured } from "@/server/tenant";
import { MEDIA_MAX_BYTES } from "@/components/inbox/types";
import { inboxScopeFromSession } from "../session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Envio de arquivo ou áudio gravado pela caixa de entrada (equipe e portal).
 * É rota e não server action porque server actions limitam o corpo a 1 MB.
 * Campos: conversationId, file, caption (opcional).
 */
export async function POST(req: Request) {
  try {
    const { scope, author } = await inboxScopeFromSession();
    const form = await req.formData();
    const conversationId = String(form.get("conversationId") ?? "");
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Escolha um arquivo.");
    if (file.size > MEDIA_MAX_BYTES) throw new Error("Arquivo grande demais: o limite é 16 MB.");
    const caption = typeof form.get("caption") === "string" ? String(form.get("caption")) : undefined;
    const data = Buffer.from(await file.arrayBuffer());
    // O navegador pode mandar "audio/webm;codecs=opus": o que importa é o tipo principal.
    const mime = (file.type || "application/octet-stream").split(";")[0].trim().toLowerCase();
    await sendInboxMedia(scope, conversationId, { data, mime, name: file.name || "arquivo" }, { caption }, author);
    revalidatePath(scope.staff ? "/conversas" : "/portal/conversas");
    return NextResponse.json({ error: null });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof TenantNotConfigured) return NextResponse.json({ error: "O banco das conversas não está configurado." }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

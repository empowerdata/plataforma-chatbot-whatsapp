import { AuthError } from "@/server/auth/guards";
import { getInboxMedia, MediaNotFound } from "@/server/services/inbox";
import { inboxScopeFromSession } from "../../session";

export const dynamic = "force-dynamic";

/**
 * Mídia de uma mensagem, buscada no WhatsApp na hora (nada fica guardado no
 * servidor). O navegador guarda em cache por um dia, então a atualização
 * automática da conversa não baixa de novo. `?download=1` força o download.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/inbox/media/[id]">) {
  try {
    const { scope } = await inboxScopeFromSession();
    const { id } = await ctx.params;
    const media = await getInboxMedia(scope, id);
    const download = new URL(req.url).searchParams.get("download") === "1";
    const name = media.fileName ?? "arquivo";
    return new Response(new Uint8Array(media.data), {
      headers: {
        "content-type": media.mime,
        "content-length": String(media.data.length),
        "cache-control": "private, max-age=86400",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${name.replace(/[^\w.\- ]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return new Response("Sessão expirada.", { status: 401 });
    if (err instanceof MediaNotFound) return new Response("Mídia indisponível.", { status: 404 });
    return new Response("Não foi possível abrir a mídia.", { status: 502 });
  }
}

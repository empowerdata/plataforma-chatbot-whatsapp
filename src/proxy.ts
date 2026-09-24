import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/definir-senha", "/api/webhooks", "/api/internal", "/_next", "/favicon", "/icon", "/manifest"];

/**
 * Só verifica a presença do cookie de sessão; a validação real acontece nos
 * layouts/guards (o proxy não deve depender de banco).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const hasSession = request.cookies.has("pc_session");
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // As rotas de mídia da caixa de entrada ficam de fora: o proxy do Next copia o corpo
  // da requisição com limite de 10 MB (arquivos vão até 16 MB). Elas validam a sessão sozinhas.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/inbox/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
